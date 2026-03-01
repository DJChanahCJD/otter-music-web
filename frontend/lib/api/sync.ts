import { client } from "./client";
import { unwrap } from "./config";

export type SyncCheckResponse = {
  lastSyncTime: number;
};

export type SyncPullResponse = {
  data: unknown;
  lastSyncTime: number;
};

export type SyncPushResponse = {
  lastSyncTime: number;
};

function getAuthHeaders(syncKey: string) {
  return {
    Authorization: `Bearer ${syncKey}`,
  };
}

/**
 * 检查同步状态
 */
export async function syncCheck(syncKey: string): Promise<SyncCheckResponse> {
  return unwrap<SyncCheckResponse>(
    client.sync.check.$get({
      header: getAuthHeaders(syncKey),
    })
  );
}

/**
 * 拉取同步数据
 */
export async function syncPull(syncKey: string): Promise<SyncPullResponse> {
  return unwrap<SyncPullResponse>(
    client.sync.$get({
      header: getAuthHeaders(syncKey),
    })
  );
}

/**
 * 推送同步数据
 */
export async function syncPush(
  syncKey: string,
  data: unknown,
  lastSyncTime: number
): Promise<SyncPushResponse> {
  return unwrap<SyncPushResponse>(
    client.sync.$post({
      header: getAuthHeaders(syncKey),
      json: { data, lastSyncTime },
    })
  );
}
