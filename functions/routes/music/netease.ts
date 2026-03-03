import { Hono } from 'hono';
import type { Env } from '../../types/hono';
import {
  getUserPlaylists,
  getPlaylistDetail,
  getQrKey,
  checkQrStatus,
  getMyInfo,
  getRecommendPlaylists,
  search,
  getToplist,
  getAlbum,
  getArtist,
  getPlaylists,
  resolveUrl,
} from '../../utils/music/netease-api';

export const neteaseRoutes = new Hono<{ Bindings: Env }>();

/**
 * 获取二维码登录所需的 key
 */
neteaseRoutes.get('/login/qr/key', async (c) => {
  try {
    const res = await getQrKey();
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 检查二维码登录状态
 */
neteaseRoutes.get('/login/qr/check', async (c) => {
  const key = c.req.query('key');
  if (!key) return c.json({ error: 'Key required' }, 400);

  try {
    const res = await checkQrStatus(key);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取我的用户信息
 */
neteaseRoutes.post('/my-info', async (c) => {
  const { cookie } = await c.req.json();
  try {
    const res = await getMyInfo(cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取用户歌单
 */
neteaseRoutes.post('/user-playlists', async (c) => {
  const { userId, cookie } = await c.req.json();
  try {
    const res = await getUserPlaylists(userId, cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取歌单详情
 */
neteaseRoutes.post('/playlist', async (c) => {
  const { playlistId, cookie } = await c.req.json();
  try {
    const res = await getPlaylistDetail(playlistId, cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取每日推荐歌单
 */
neteaseRoutes.post('/recommend', async (c) => {
  const { cookie } = await c.req.json();
  try {
    const res = await getRecommendPlaylists(cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取排行榜
 */
neteaseRoutes.post('/toplist', async (c) => {
  const { cookie } = await c.req.json();
  try {
    const res = await getToplist(cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取专辑详情
 */
neteaseRoutes.post('/album', async (c) => {
  const { id, cookie } = await c.req.json();
  try {
    const res = await getAlbum(id, cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取艺人详情
 */
neteaseRoutes.post('/artist', async (c) => {
  const { id, cookie } = await c.req.json();
  try {
    const res = await getArtist(id, cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 获取分类歌单
 */
neteaseRoutes.post('/playlists', async (c) => {
  const { cat, order, limit, offset, cookie } = await c.req.json();
  try {
    const res = await getPlaylists(cat, order, limit, offset, cookie);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * 解析 URL
 */
neteaseRoutes.post('/resolve', async (c) => {
  const { url } = await c.req.json();
  try {
    const res = resolveUrl(url);
    if (!res) return c.json({ error: 'Invalid URL' }, 400);
    return c.json(res);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

neteaseRoutes.post('/search', async (c) => {
  const { keyword, page, limit, cookie } = await c.req.json();

  const name = String(keyword || '').trim();
  if (!name) return c.json({ error: 'Keyword required' }, 400);

  const currentPage = Math.max(1, parseInt(String(page || '1'), 10) || 1);
  const currentLimit = Math.max(1, Math.min(50, parseInt(String(limit || '20'), 10) || 20));

  try {
    const res = await search(name, 1, currentPage, currentLimit, cookie || '');

    const songs = res.data?.result?.songs || [];
    const songCount = res.data?.result?.songCount || 0;

    const items = songs.map((s: any) => ({
      id: `ne_track_${s.id}`,
      name: s.name,
      artist: (s.artists || s.ar || []).map((a: any) => a.name),
      album: s.album?.name || s.al?.name || '',
      pic_id: s.album?.picUrl || s.al?.picUrl || '',
      url_id: String(s.id),
      lyric_id: String(s.id),
      source: '_netease',
    }));

    const hasMore = currentPage * currentLimit < songCount;
    return c.json({ items, hasMore });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
