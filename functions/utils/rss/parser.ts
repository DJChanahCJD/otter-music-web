import sax from 'sax';
import { RssFeedData, RssEpisode } from './types';
import { normalizeUrl, stripHtml } from './utils';

const MAX_EPISODES = 20; // 极简限制：最多提取20条

// 核心：SAX 流式解析器
export async function streamParseRss(stream: ReadableStream<Uint8Array>, feedUrl: string): Promise<RssFeedData> {
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
