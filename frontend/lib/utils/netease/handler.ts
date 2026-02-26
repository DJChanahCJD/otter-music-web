import { NextResponse } from 'next/server';
import { search, getSongUrl, getSongDetail, getLyric } from "./api";

/**
 * 处理网易云音乐请求（Next.js Route Handler 版本）
 * @param query 查询参数对象
 */
export async function handleNeteaseRequest(query: Record<string, string>): Promise<NextResponse> {
  try {
    const type = query.types;
    const cookie = query.cookie || '';

    if (type === 'search') {
      const name = query.name || '';
      const page = parseInt(query.pages || '1');
      const count = parseInt(query.count || '20');

      const res = await search(name, 1, page, count, cookie);

      if (res.data.result && res.data.result.songs) {
        const list = res.data.result.songs.map((s: any) => ({
          id: s.id,
          name: s.name,
          artist: s.artists.map((a: any) => a.name),
          album: s.album.name,
          pic: s.album.picUrl,
          source: '_netease',
          url_id: s.id,
          pic_id: s.id,
          lyric_id: s.id
        }));
        return NextResponse.json(list);
      }
      return NextResponse.json([]);
    }

    if (type === 'url') {
      const id = query.id || '';
      let br = parseInt(query.br) || 192000;
      if (br < 1000) br *= 1000;
      const res = await getSongUrl(id, br, cookie);

      if (res.data.data && res.data.data[0]) {
        return NextResponse.json({
          url: res.data.data[0].url,
          br: res.data.data[0].br,
          size: res.data.data[0].size
        });
      }
      return NextResponse.json({ url: '' });
    }

    if (type === 'pic') {
      const id = query.id || '';
      if (id.startsWith('http')) {
        return NextResponse.json({ url: id });
      }

      const res = await getSongDetail(id, cookie);
      if (res && res.al) {
        return NextResponse.json({ url: res.al.picUrl });
      }
      return NextResponse.json({ url: '' });
    }

    if (type === 'lyric') {
      const id = query.id || '';
      const res = await getLyric(id, cookie);
      return NextResponse.json({
        lyric: res.data.lrc?.lyric || '',
        tlyric: res.data.tlyric?.lyric || ''
      });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });

  } catch (e: any) {
    console.error('Local NetEase Handler Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}