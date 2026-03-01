import { Hono } from 'hono';
import { ok, fail, encodeContentDisposition } from '../utils/response';
import { Env } from '../types/hono';
import { getFromCache, putToCache } from '../utils/cache';

const app = new Hono<{ Bindings: Env }>();

const GITHUB_API_URL =
  'https://api.github.com/repos/DJChanahCJD/otter-music/releases/latest';

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
  }[];
}

/* =========================
   更新检查
========================= */
app.get('/check', async (c) => {
  const current = c.req.query('version');

  try {
    const cacheKey = new Request(GITHUB_API_URL);
    const cached = await getFromCache(cacheKey);

    const release: GitHubRelease = cached
      ? await cached.json()
      : await fetchRelease(cacheKey);

    const apk = release.assets.find(a => a.name.endsWith('.apk'));
    if (!apk) return fail(c, 'No APK found', 404);

    const latest = release.tag_name;

    return ok(c, {
      hasUpdate: current ? isNewer(latest, current) : true,
      latestVersion: latest,
      changelog: release.body,
      downloadUrl: buildProxyUrl(c.req.url, apk),
      directUrl: apk.browser_download_url,
      publishDate: release.published_at,
      size: apk.size,
    });

  } catch (e) {
    console.error(e);
    return fail(c, 'Update check failed', 500);
  }
});

/* =========================
   下载代理
========================= */
app.get('/download', async (c) => {
  const url = c.req.query('url');
  const filename = c.req.query('filename') || 'app-release.apk';

  if (!url) return fail(c, 'Missing url', 400);
  if (!isValidGithubUrl(url)) return fail(c, 'Invalid source', 403);

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Otter-Music-App' },
      redirect: 'follow',
    });

    if (!resp.ok || !resp.body)
      return fail(c, 'Download failed', 502);

    const headers = new Headers(resp.headers);
    headers.set('Content-Disposition', encodeContentDisposition(filename, false));
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.delete('Set-Cookie');

    return new Response(resp.body, { status: resp.status, headers });

  } catch (e) {
    console.error(e);
    return fail(c, 'Download error', 500);
  }
});

/* =========================
   工具函数
========================= */

async function fetchRelease(cacheKey: Request) {
  const resp = await fetch(GITHUB_API_URL, {
    headers: {
      'User-Agent': 'Otter-Music-App',
      'Accept': 'application/vnd.github.v3+json',
    },
    cf: {
      cacheTtl: 600,          // ⭐ 边缘缓存 10 分钟
      cacheEverything: true,
    }
  } as any);

  if (!resp.ok)
    throw new Error(`GitHub API ${resp.status}`);

  await putToCache(cacheKey, resp, 'api');
  return resp.json();
}

function buildProxyUrl(baseUrl: string, asset: any) {
  const origin = new URL(baseUrl).origin;
  return `${origin}/update/download?url=${encodeURIComponent(
    asset.browser_download_url
  )}&filename=${encodeURIComponent(asset.name)}`;
}

function isValidGithubUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return ['github.com', 'objects.githubusercontent.com']
      .some(d => host.endsWith(d));
  } catch {
    return false;
  }
}

function isNewer(latest: string, current: string) {
  const a = latest.replace(/^v/, '').split('.').map(Number);
  const b = current.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export const updateRoutes = app;