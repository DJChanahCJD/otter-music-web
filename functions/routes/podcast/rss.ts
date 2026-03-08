import { Hono } from 'hono';
import { z } from 'zod';
import sax from 'sax';
import type { Env } from '../../types/hono';

export const rssRoutes = new Hono<{ Bindings: Env }>();

const RSS_FETCH_TIMEOUT_MS = 8000;
const RSS_CACHE_TTL_SECONDS = 60 * 10;
const MAX_EPISODES = 20; // 极简限制：最多提取20条

const querySchema = z.object({
  url: z.string().trim().url().optional(),
  rssUrl: z.string().trim().url().optional(),
});

export type RssEpisode = {
  id: string;
  title: string;
  audioUrl: string | null;
  desc: string;
  link: string | null;
  pubDate: string | null;
  coverUrl: string | null;
};

export type RssFeedData = {
  name: string;
  description: string;
  coverUrl: string | null;
  link: string | null;
  episodes: RssEpisode[];
};

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (m, p1) => 
      ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[p1.toLowerCase()] || m
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url?: string, baseUrl?: string): string | null {
  if (!url) return null;
  try { return new URL(url, baseUrl).toString(); } 
  catch { return null; }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8',
        'user-agent': 'OtterMusic/2.0',
      },
      cf: { cacheTtl: RSS_CACHE_TTL_SECONDS, cacheEverything: true },
    } as any);
  } finally {
    clearTimeout(timer);
  }
}

// 核心：SAX 流式解析器
async function streamParseRss(stream: ReadableStream<Uint8Array>, feedUrl: string): Promise<RssFeedData> {
  const parser = sax.parser(true, { trim: true, normalize: true }); // true = 严格XML模式
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  const feed: RssFeedData = { name: '', description: '', coverUrl: null, link: null, episodes: [] };
  let currentEp: Partial<RssEpisode> | null = null;
  let textBuffer = '';
  let count = 0;
  let isDone = false;

  parser.onopentag = (node) => {
    textBuffer = '';
    const name = node.name.toLowerCase();
    
    // 进入单集节点
    if (name === 'item' || name === 'entry') currentEp = {};
    
    // 提取属性 (封面与音频)
    const attrs = node.attributes as Record<string, string>;
    const urlAttr = attrs.url || attrs.href;
    
    if (currentEp) {
      if ((name === 'enclosure' || (name === 'link' && attrs.rel === 'enclosure')) && urlAttr) {
        currentEp.audioUrl = normalizeUrl(urlAttr, feedUrl);
      }
      if ((name === 'itunes:image' || name === 'image') && urlAttr) {
        currentEp.coverUrl = normalizeUrl(urlAttr, feedUrl);
      }
    } else {
      if ((name === 'itunes:image' || name === 'logo' || name === 'icon') && urlAttr) {
        feed.coverUrl = normalizeUrl(urlAttr, feedUrl);
      }
    }
  };

  parser.ontext = (t) => { textBuffer += t; };
  parser.oncdata = (t) => { textBuffer += t; }; // 处理 CDATA

  parser.onclosetag = (tagName) => {
    const name = tagName.toLowerCase();
    const text = stripHtml(textBuffer);

    if (name === 'item' || name === 'entry') {
      if (currentEp?.title && currentEp?.audioUrl) {
        feed.episodes.push({
          id: (currentEp.id || currentEp.link || currentEp.title || '').slice(0, 500),
          title: currentEp.title,
          desc: currentEp.desc || '',
          audioUrl: currentEp.audioUrl,
          link: currentEp.link || null,
          pubDate: currentEp.pubDate || null,
          coverUrl: currentEp.coverUrl || feed.coverUrl,
        });
        count++;
        if (count >= MAX_EPISODES) isDone = true; // 达到20条，触发阻断标识
      }
      currentEp = null;
    }

    // 字段赋值
    if (currentEp) {
      if (name === 'title') currentEp.title = text;
      else if (['description', 'content:encoded', 'summary', 'content'].includes(name)) currentEp.desc = text;
      else if (name === 'link' && !currentEp.link) currentEp.link = normalizeUrl(text, feedUrl) || undefined;
      else if (['pubdate', 'published', 'updated'].includes(name)) currentEp.pubDate = text;
      else if (['guid', 'id'].includes(name)) currentEp.id = text;
    } else {
      if (name === 'title' && !feed.name) feed.name = text;
      else if (['description', 'subtitle'].includes(name) && !feed.description) feed.description = text;
      else if (name === 'link' && !feed.link) feed.link = normalizeUrl(text, feedUrl);
      else if (name === 'url' && !feed.coverUrl) feed.coverUrl = normalizeUrl(text, feedUrl); // 处理 <image><url>
    }
    textBuffer = '';
  };

  try {
    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.warn('Stream parsing interrupted or failed:', err);
  } finally {
    // 【核心】阻断网络连接，释放内存
    if (!isDone) await reader.cancel(); 
    else await reader.cancel('Max episodes reached');
    parser.close();
  }

  return feed;
}

rssRoutes.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ success: false, error: 'Invalid url parameter' }, 400);

  const rssUrl = (parsed.data.url || parsed.data.rssUrl || '').trim();
  if (!rssUrl) return c.json({ success: false, error: 'Missing query parameter: url' }, 400);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rssUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return c.json({ success: false, error: 'Invalid or unsupported RSS URL' }, 400);
  }

  try {
    const response = await fetchWithTimeout(parsedUrl.toString(), RSS_FETCH_TIMEOUT_MS);
    if (!response.ok || !response.body) {
      return c.json({ success: false, error: `Failed to fetch RSS: HTTP ${response.status}` }, 502);
    }

    // 直接流式灌入解析器，摒弃全量文本读取和文件大小校验
    const data = await streamParseRss(response.body, parsedUrl.toString());

    return c.json({ success: true, data });
  } catch (error) {
    console.error('RSS Error:', error);
    return c.json({ success: false, error: error instanceof Error ? error.message : 'RSS parse failed' }, 500);
  }
});