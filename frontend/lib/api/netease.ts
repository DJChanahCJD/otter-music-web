import { clientSWRFetch } from "../utils/cache";
import { API_URL } from "./config";
import type { MusicTrack } from "@shared/types";

const TTL_SHORT = 5 * 60 * 1000;
const TTL_MEDIUM = 15 * 60 * 1000;
const TTL_LONG = 30 * 60 * 1000;

export const neteaseApi = {
  getUserPlaylists: async (userId: string, cookie: string) => {
    const key = `netease:user-playlists:${userId}`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/user-playlists`, {
          method: 'POST',
          body: JSON.stringify({ userId, cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Fetch playlists failed');
        }
        return res.json();
      },
      TTL_MEDIUM
    );
  },

  getPlaylistDetail: async (playlistId: string, cookie: string) => {
    const key = `netease:playlist:${playlistId}`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/playlist`, {
          method: 'POST',
          body: JSON.stringify({ playlistId, cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Fetch playlist detail failed');
        }
        return res.json();
      },
      TTL_LONG
    );
  },

  getQrKey: async () => {
    const res = await fetch(`${API_URL}/music-api/netease/login/qr/key`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to get QR key');
    return res.json();
  },

  checkQrStatus: async (key: string) => {
    const res = await fetch(`${API_URL}/music-api/netease/login/qr/check?key=${key}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to check status');
    return res.json();
  },

  getMyInfo: async (cookie: string) => {
    const key = `netease:my-info`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/my-info`, {
          method: 'POST',
          body: JSON.stringify({ cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch user info');
        return res.json();
      },
      TTL_SHORT
    );
  },

  getRecommendPlaylists: async (cookie: string) => {
    const key = `netease:recommend`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/recommend`, {
          method: 'POST',
          body: JSON.stringify({ cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch recommendations');
        return res.json();
      },
      TTL_SHORT
    );
  },

  searchTracks: async (
    keyword: string,
    page: number,
    limit: number,
    cookie: string,
    signal?: AbortSignal
  ): Promise<{ items: MusicTrack[]; hasMore: boolean }> => {
    const res = await fetch(`${API_URL}/music-api/netease/search`, {
      method: "POST",
      body: JSON.stringify({ keyword, page, limit, cookie }),
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || "Search failed");
    }

    return res.json();
  },

  getToplist: async (cookie: string) => {
    const key = `netease:toplist`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/toplist`, {
          method: 'POST',
          body: JSON.stringify({ cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch toplist');
        return res.json();
      },
      TTL_LONG
    );
  },

  getAlbum: async (id: string, cookie: string) => {
    const key = `netease:album:${id}`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/album`, {
          method: 'POST',
          body: JSON.stringify({ id, cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch album');
        return res.json();
      },
      TTL_LONG
    );
  },

  getArtist: async (id: string, cookie: string) => {
    const key = `netease:artist:${id}`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/artist`, {
          method: 'POST',
          body: JSON.stringify({ id, cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch artist');
        return res.json();
      },
      TTL_LONG
    );
  },

  getPlaylists: async (cat: string, order: string | undefined, limit: number, offset: number, cookie: string) => {
    const normalizedCat = cat || '全部';
    const normalizedOrder = order || 'hot';
    const key = `netease:playlists:${normalizedCat}:${normalizedOrder}:${limit}:${offset}`;

    return clientSWRFetch(
      key,
      async () => {
        const res = await fetch(`${API_URL}/music-api/netease/playlists`, {
          method: 'POST',
          body: JSON.stringify({ cat: normalizedCat, order: normalizedOrder, limit, offset, cookie }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch playlists');
        return res.json();
      },
      TTL_SHORT
    );
  },

  resolveUrl: async (url: string) => {
    const res = await fetch(`${API_URL}/music-api/netease/resolve`, {
      method: 'POST',
      body: JSON.stringify({ url }),
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to resolve URL');
    return res.json();
  },
};
