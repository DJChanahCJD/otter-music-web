import { client } from "./client";
import { unwrap } from "./config";

export type SyncCheckResponse = {
  lastSyncTime: number;
};

// 后端 POST / 和 GET /pull 返回的结构是一样的
export type SyncDataResponse<T = unknown> = {
  data: T;
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
    client.sync.v2.check.$get({
      header: getAuthHeaders(syncKey),
    })
  );
}

/**
 * 拉取同步数据
 */
export async function syncPull<T = unknown>(syncKey: string): Promise<SyncDataResponse<T>> {
  return unwrap<SyncDataResponse<T>>(
    client.sync.v2.pull.$get({
      header: getAuthHeaders(syncKey),
    })
  );
}

/**
 * 推送并拉取（一趟式 Push & Pull，服务端执行 LWW 合并）
 * clientVersion 为本地持有的 lastSyncTime，服务端用于两级短路跳过无意义写入
 */
export async function syncPushAndPull<T = unknown>(
  syncKey: string,
  data: T,
  clientVersion?: number
): Promise<SyncDataResponse<T>> {
  return unwrap<SyncDataResponse<T>>(
    client.sync.v2.$post({
      header: getAuthHeaders(syncKey),
      json: { data, clientVersion },
    })
  );
}
