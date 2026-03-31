import { toast } from "sonner";
import { ApiError } from "@/lib/api/config";
import { useSyncStore } from "@/stores/sync-store";
import { useMusicStore } from "@/stores/music-store";
import { syncCheck, syncPull, syncPushAndPull } from "@/lib/api/sync";
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
    favorites: data.favorites ?? [],
    playlists: data.playlists ?? [],
  });
};

/**
 * 数据同步 (V2: 一趟式同步)
 * - syncCheck 检查版本
 * - syncPushAndPull 推送本地快照并拉取服务端 LWW 合并结果
 * - POST 失败时 syncPull 兜底
 */
export async function checkAndSync(force = false): Promise<SyncResult> {
  const { syncKey, lastSyncTime, setLastSyncTime, clearSyncConfig } = useSyncStore.getState();
  if (!syncKey) return { success: false, error: "未配置同步密钥" };

  try {
    // 1. 获取云端最新版本号
    let serverTime: number;
    try {
      ({ lastSyncTime: serverTime } = await syncCheck(syncKey));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        clearSyncConfig();
        toast.error("同步密钥不存在或已失效");
        return { success: false, error: "密钥失效" };
      }
      throw err;
    }

    // 2. 节流：非强制同步，且云端没有新数据，且本地最近刚同步过，则跳过
    if (!force && serverTime === lastSyncTime && lastSyncTime > 0) {
      if (Date.now() - serverTime < SYNC_INTERVAL) return { success: true, skipped: true };
    }

    // 3. 一趟式 Push & Pull（无论云端是否有更新，直接发送本地快照进行 LWW 合并）
    const response = await syncPushAndPull<SyncSnapshot>(syncKey, getSnapshot());

    // 4. 无条件信任服务端合并后的权威结果
    if (response.data) {
      applySnapshot(response.data);
      setLastSyncTime(response.lastSyncTime);
    }

    toast.success(serverTime > lastSyncTime ? "已同步云端新数据" : "同步成功");
    return { success: true };

  } catch (err) {
    // 5. 兜底逻辑：POST 失败时尝试全量拉取一次
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
