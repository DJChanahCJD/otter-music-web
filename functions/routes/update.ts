import { Hono } from 'hono';
import { ok, fail, encodeContentDisposition } from '../utils/response';
import { Env } from '../types/hono';

const app = new Hono<{ Bindings: Env }>();

// GitHub Repo Info
const REPO_OWNER = 'DJChanahCJD';
const REPO_NAME = 'otter-music';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
  }[];
}

/**
 * Check for updates
 * GET /api/update/check?version=v1.0.0
 */
app.get('/check', async (c) => {
  const currentVersion = c.req.query('version');

  try {
    const headers = {
      'User-Agent': 'Otter-Music-App',
      'Accept': 'application/vnd.github.v3+json',
    };

    const response = await fetch(GITHUB_API_URL, { 
      headers,
      method: 'GET',
    });

    if (!response.ok) {
      console.error(`GitHub API Error: ${response.status} ${response.statusText}`);
      return fail(c, 'Failed to fetch release info from GitHub', 502);
    }

    const release: GitHubRelease = await response.json();
    
    // Find APK asset
    const apkAsset = release.assets.find(asset => asset.name.endsWith('.apk'));
    
    if (!apkAsset) {
        return fail(c, 'No APK found in the latest release', 404);
    }

    const latestVersion = release.tag_name;
    const hasUpdate = currentVersion ? compareVersions(latestVersion, currentVersion) : true;

    // Construct download URL pointing to our proxy
    const proxyDownloadUrl = `${new URL(c.req.url).origin}/update/download?url=${encodeURIComponent(apkAsset.browser_download_url)}&filename=${encodeURIComponent(apkAsset.name)}`;

    return ok(c, {
      hasUpdate,
      latestVersion,
      currentVersion,
      changelog: release.body,
      downloadUrl: proxyDownloadUrl,
      directUrl: apkAsset.browser_download_url,
      publishDate: release.published_at,
      size: apkAsset.size,
    });

  } catch (error) {
    console.error('Update check error:', error);
    return fail(c, 'Internal Server Error', 500);
  }
});

/**
 * Proxy download
 * GET /api/update/download?url=...&filename=...
 */
app.get('/download', async (c) => {
  const url = c.req.query('url');
  const filename = c.req.query('filename') || 'app-release.apk';

  if (!url) {
    return fail(c, 'Missing url parameter', 400);
  }

  // Validate URL domain
  try {
    const urlObj = new URL(url);
    const allowedDomains = ['github.com', 'objects.githubusercontent.com'];
    if (!allowedDomains.some(domain => urlObj.hostname.endsWith(domain))) {
        return fail(c, 'Invalid download source', 403);
    }
  } catch (e) {
    return fail(c, 'Invalid URL', 400);
  }

  try {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Otter-Music-App',
        },
        redirect: 'follow'
    });

    if (!response.ok) {
        return fail(c, `Download failed: ${response.statusText}`, 502);
    }
    
    if (!response.body) {
        return fail(c, 'Empty response body', 502);
    }

    const headers = new Headers(response.headers);
    
    // Set content disposition
    headers.set('Content-Disposition', encodeContentDisposition(filename, false));
    headers.set('Content-Type', 'application/vnd.android.package-archive');
    
    // Cache control (immutable for releases)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Clean up sensitive headers
    headers.delete('Set-Cookie');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

  } catch (error) {
    console.error('Download proxy error:', error);
    return fail(c, 'Download failed', 500);
  }
});

function compareVersions(latest: string, current: string): boolean {
  // Remove 'v' prefix
  const v1 = latest.replace(/^v/, '').split('.').map(Number);
  const v2 = current.replace(/^v/, '').split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const n1 = v1[i] || 0;
    const n2 = v2[i] || 0;
    if (n1 > n2) return true;
    if (n1 < n2) return false;
  }
  return false;
}

export const updateRoutes = app;
