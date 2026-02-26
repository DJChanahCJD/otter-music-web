import { clientSWRFetch } from "../utils/cache";
import { API_URL } from "./config";

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
  }
};
