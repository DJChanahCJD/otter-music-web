import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../types/hono";
import { ok, fail } from "@utils/response";
import { authMiddleware } from "middleware/auth";
import { SYNC_KEY_PREFIX, SyncKeyMetadata } from "@shared/types";

/** ===============================
 * Otter Music Sync (API-Key Model)
 * 一个 key = 一个同步空间
 * =============================== */

type Variables = { syncKey: string; kvKey: string };
export const syncRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type SyncRecord = { id: string; update_time: number; is_deleted: boolean } & Record<string, any>;
type SyncPlaylist = SyncRecord & { tracks: SyncRecord[] };

/* ---------------- 核心工具函数 ---------------- */

// 1. 生成不混淆的随机同步码
const generateKey = (prefix?: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code = Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
  return prefix ? `${prefix}_${code}` : code;
};

// 2. 极简的数据清洗器 (防御性编程，容错所有脏数据)
const sanitizeRecord = (v: any): SyncRecord | null => 
  (v?.id && typeof v.id === "string" ? { ...v, update_time: Number.isFinite(v.update_time) ? v.update_time : 0, is_deleted: Boolean(v.is_deleted) } : null);

const sanitizeList = <T>(v: any): T[] => (Array.isArray(v) ? (v.map(sanitizeRecord).filter(Boolean) as unknown as T[]) : []);

const sanitizeSyncData = (v: any) => ({
  ...(typeof v === "object" && v ? v : {}),
  favorites: sanitizeList<SyncRecord>(v?.favorites),
  playlists: sanitizeList<SyncPlaylist>(v?.playlists).map(p => ({ ...p, tracks: sanitizeList<SyncRecord>(p.tracks) }))
});

// 3. 泛型 LWW 增量合并算法
function mergeLWW<T extends SyncRecord>(server: T[], client: T[], mergeChildren?: (s: T, c: T) => T): T[] {
  const map = new Map<string, T>(server.map(item => [item.id, item]));
  const order = server.map(item => item.id);

  for (const c of client) {
    const s = map.get(c.id);
    if (!s) {
      map.set(c.id, c);
      order.push(c.id);
    } else {
      const winner = c.update_time > s.update_time ? c : s;
      const merged = mergeChildren ? mergeChildren(s, c) : winner;
      map.set(c.id, { ...merged, update_time: winner.update_time, is_deleted: winner.is_deleted });
    }
  }
  return order.map(id => map.get(id)!);
}

// 4. 垃圾回收 (伴随计数器提升性能)
function gcSyncData(data: ReturnType<typeof sanitizeSyncData>, now: number) {
  let gcCount = 0;
  const gc = <T extends SyncRecord>(list: T[]) => list.filter(r => {
    const isExpired = r.is_deleted && now - r.update_time > TOMBSTONE_TTL_MS;
    if (isExpired) gcCount++;
    return !isExpired;
  });

  return {
    gcCount,
    cleanedData: {
      ...data,
      favorites: gc(data.favorites),
      playlists: gc(data.playlists).map(p => ({ ...p, tracks: gc(p.tracks) }))
    }
  };
}

/* ---------------- 路由鉴权中间件 ---------------- */

const syncAuthMiddleware = async (c: any, next: Function) => {
  const match = c.req.header("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (!match) return fail(c, "Invalid Authorization", 401);
  c.set("syncKey", match[1]);
  c.set("kvKey", `${SYNC_KEY_PREFIX}${match[1]}`);
  await next();
};

/* ===============================
 * 客户端 API (应用 syncAuthMiddleware)
 * =============================== */

syncRoutes.use("/", syncAuthMiddleware);
syncRoutes.use("/check", syncAuthMiddleware);

syncRoutes.get("/check", async (c) => {
  const { metadata } = await c.env.oh_file_url.getWithMetadata<SyncKeyMetadata>(c.get("kvKey"));
  if (metadata === null) return fail(c, "Sync key not found", 404);
  return ok(c, { lastSyncTime: metadata?.lastSyncTime ?? 0 });
});

syncRoutes.get("/", async (c) => {
  const kv = c.env.oh_file_url;
  const kvKey = c.get("kvKey");

  const { value, metadata } = await kv.getWithMetadata<SyncKeyMetadata>(kvKey);
  if (value === null) return fail(c, "Sync key not found", 404);

  const serverTime = metadata?.lastSyncTime ?? 0;
  const parsedData = value ? JSON.parse(value) : {};
  const { cleanedData, gcCount } = gcSyncData(sanitizeSyncData(parsedData), Date.now());

  // 如果触发了 GC 删除，保存最新的干净状态（避免高成本的 JSON.stringify Diff）
  if (gcCount > 0) {
    await kv.put(kvKey, JSON.stringify(cleanedData), {
      metadata: { lastSyncTime: serverTime } satisfies SyncKeyMetadata,
    });
  }

  return ok(c, { data: cleanedData, lastSyncTime: serverTime });
});

syncRoutes.post(
  "/",
  zValidator("json", z.object({ data: z.any(), lastSyncTime: z.number().optional() })),
  async (c) => {
    const kv = c.env.oh_file_url;
    const kvKey = c.get("kvKey");
    const { data: clientRawData } = c.req.valid("json");

    const existing = await kv.get(kvKey);
    if (existing === null) return fail(c, "Sync key not found", 404);

    const now = Date.now();
    const serverData = gcSyncData(sanitizeSyncData(existing ? JSON.parse(existing) : {}), now).cleanedData;
    const clientData = gcSyncData(sanitizeSyncData(clientRawData), now).cleanedData;

    // LWW 增量合并
    const mergedData = {
      ...serverData,
      ...clientData,
      favorites: mergeLWW(serverData.favorites, clientData.favorites),
      playlists: mergeLWW(serverData.playlists, clientData.playlists, (s, c) => ({
        ...c, // 歌单元数据由最新的决定
        tracks: mergeLWW(s.tracks, c.tracks) // Tracks 单独做增量合并
      })),
    };

    await kv.put(kvKey, JSON.stringify(mergedData), {
      metadata: { lastSyncTime: now } satisfies SyncKeyMetadata,
    });

    return ok(c, { lastSyncTime: now }, "Sync successful");
  }
);

/* ===============================
 * 管理端 API (应用 authMiddleware)
 * =============================== */

syncRoutes.post(
  "/create-key",
  authMiddleware,
  zValidator("json", z.object({ prefix: z.string().min(1).max(20).regex(/^[a-z0-9_-]+$/i).optional() })),
  async (c) => {
    const { prefix } = c.req.valid("json");
    const kv = c.env.oh_file_url;

    // 重试 5 次生成唯一 Key
    for (let i = 0; i < 5; i++) {
      const syncKey = generateKey(prefix);
      const kvKey = `${SYNC_KEY_PREFIX}${syncKey}`;
      
      if (!(await kv.get(kvKey))) {
        await kv.put(kvKey, "", { metadata: { lastSyncTime: 0 } });
        return ok(c, { syncKey }, "Sync key created");
      }
    }
    return fail(c, "Failed to generate unique key", 500);
  }
);

syncRoutes.get("/keys", authMiddleware, async (c) => {
  const kv = c.env.oh_file_url;
  const keys: Array<{ key: string; lastSyncTime: number }> = [];
  let cursor: string | undefined;

  do {
    const result = await kv.list({ prefix: SYNC_KEY_PREFIX, cursor });
    for (const key of result.keys) {
      keys.push({
        key: key.name.replace(SYNC_KEY_PREFIX, ""),
        lastSyncTime: (key.metadata as SyncKeyMetadata)?.lastSyncTime ?? 0,
      });
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  return ok(c, { keys });
});

syncRoutes.delete("/keys/:key", authMiddleware, async (c) => {
  const syncKey = c.req.param("key");
  const kvKey = `${SYNC_KEY_PREFIX}${syncKey}`;
  const kv = c.env.oh_file_url;

  if (await kv.get(kvKey) === null) {
    return fail(c, "Sync key not found", 404);
  }

  await kv.delete(kvKey);
  return ok(c, null, "Sync key deleted");
});