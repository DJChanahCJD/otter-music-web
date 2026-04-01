import { toast } from "sonner";
import { ApiError } from "@/lib/api/config";
import { useSyncStore } from "@/stores/sync-store";
import { useMusicStore } from "@/stores/music-store";
import { syncPull, syncPushAndPull } from "@/lib/api/sync";
import { MusicTrack, Playlist } from "@shared/types";
import { MergedMusicTrack } from "@/lib/types/music";

/** --- 类型定义 --- */
type SyncSnapshot = { favorites: MusicTrack[]; playlists: Playlist[] };
export type SyncResult = { success: boolean; error?: string; skipped?: boolean };

const SYNC_INTERVAL = 60 * 60 * 1000; // 1小时节流

/** 剔除运行时附加字段（variants），确保只上传纯净的 MusicTrack */
function cleanTrack(track: MusicTrack | MergedMusicTrack): MusicTrack {
  const { variants: _, ...rest } = track as MergedMusicTrack;
  return rest;
}

/** --- 原子快照操作 --- */
const getSnapshot = (): SyncSnapshot => {
  const { favorites, playlists } = useMusicStore.getState();
  return {
    favorites: favorites.map(cleanTrack),
    playlists: playlists.map(p => ({ ...p, tracks: p.tracks.map(cleanTrack) })),
  };
};

const applySnapshot = (data: SyncSnapshot) => {
  useMusicStore.setState({
    // 直接全量 setState，保留 is_deleted tombstone 供回收站使用
    favorites: data.favorites ?? [],
    playlists: data.playlists ?? [],
  });
};

/**
 * 数据同步 (V2: 一趟式同步)
 * - 携带 clientVersion（本地 lastSyncTime）随 POST 发出，后端两级短路判断
 * - 服务端版本一致时直接返回 No changes，无需独立 syncCheck 请求
 * - POST 失败时 syncPull 兜底
 */
export async function checkAndSync(force = false): Promise<SyncResult> {
  const { syncKey, lastSyncTime, setLastSyncTime, clearSyncConfig } = useSyncStore.getState();
  if (!syncKey) return { success: false, error: "未配置同步密钥" };

  // 本地节流：非强制同步且本地最近刚同步过（1小时内），直接跳过
  if (!force && lastSyncTime > 0 && Date.now() - lastSyncTime < SYNC_INTERVAL) {
    return { success: true, skipped: true };
  }

  try {
    // 一趟式 Push & Pull，携带 clientVersion 供后端短路判断
    const response = await syncPushAndPull<SyncSnapshot>(syncKey, getSnapshot(), lastSyncTime);

    if (response.data === null) {
      // Level 1 短路：服务端版本一致，本地数据无需更新
      setLastSyncTime(response.lastSyncTime);
      return { success: true, skipped: true };
    }

    // 无条件信任服务端合并后的权威结果
    applySnapshot(response.data);
    setLastSyncTime(response.lastSyncTime);

    const isNewData = response.lastSyncTime > lastSyncTime;
    toast.success(isNewData ? "已同步云端新数据" : "同步成功");
    return { success: true };

  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      clearSyncConfig();
      toast.error("同步密钥不存在或已失效");
      return { success: false, error: "密钥失效" };
    }

    // 兜底逻辑：POST 失败时尝试全量拉取一次
    try {
      const pullRes = await syncPull<SyncSnapshot>(syncKey);
      if (pullRes.data) {
        applySnapshot(pullRes.data);
        setLastSyncTime(pullRes.lastSyncTime);
        toast("已从云端恢复数据");
        return { success: true };
      }
    } catch {
      const msg = err instanceof Error ? err.message : "同步失败";
      toast.error(msg);
      return { success: false, error: msg };
    }
    return { success: false, error: "未知同步错误" };
  }
}

