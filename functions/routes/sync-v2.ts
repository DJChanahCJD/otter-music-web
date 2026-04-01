import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../types/hono";
import { ok, fail } from "@utils/response";
import { authMiddleware } from "middleware/auth";
import { SYNC_KEY_PREFIX, SyncKeyMetadata } from "@shared/types";

type Variables = { syncKey: string; kvKey: string };
export const syncRoutesV2 = new Hono<{ Bindings: Env; Variables: Variables }>();

const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7天
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type SyncRecord = { id: string; update_time: number; is_deleted: boolean } & Record<string, any>;
type SyncPlaylist = SyncRecord & { tracks: SyncRecord[] };

/* ---------------- KV 存储层压缩（deflate-raw） ---------------- */

const COMPRESS_PREFIX = "z1:";
const COMPRESS_THRESHOLD = 1024; // 小于 1 KB 不压缩

async function deflateToBase64(str: string): Promise<string> {
  const input = new TextEncoder().encode(str);
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.length; }
  return btoa(String.fromCharCode(...buf));
}

async function inflateFromBase64(b64: string): Promise<string> {
  const binary = atob(b64);
  const input = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) input[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(input);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((acc, c) => {
      const merged = new Uint8Array(acc.length + c.length);
      merged.set(acc);
      merged.set(c, acc.length);
      return merged;
    }, new Uint8Array(0))
  );
}

/** 将 syncData 序列化并压缩后写入 KV */
async function serializeForKV(data: any): Promise<string> {
  const json = JSON.stringify(data);
  if (json.length < COMPRESS_THRESHOLD) return json;
  return COMPRESS_PREFIX + await deflateToBase64(json);
}

/** 从 KV 读取并解压、反序列化 syncData */
async function deserializeFromKV(raw: string | null): Promise<any> {
  if (!raw) return {};
  const json = raw.startsWith(COMPRESS_PREFIX)
    ? await inflateFromBase64(raw.slice(COMPRESS_PREFIX.length))
    : raw;
  return JSON.parse(json);
}

/* ---------------- 核心工具函数 ---------------- */

const generateKey = (prefix?: string) => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const code = Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
  return prefix ? `${prefix}_${code}` : code;
};

const sanitizeRecord = (v: any): SyncRecord | null =>
  (v?.id && typeof v.id === "string" ? { ...v, update_time: Number.isFinite(v.update_time) ? v.update_time : 0, is_deleted: Boolean(v.is_deleted) } : null);

const sanitizeList = <T>(v: any): T[] => (Array.isArray(v) ? (v.map(sanitizeRecord).filter(Boolean) as unknown as T[]) : []);

const sanitizeSyncData = (v: any) => ({
  ...(typeof v === "object" && v ? v : {}),
  favorites: sanitizeList<SyncRecord>(v?.favorites),
  playlists: sanitizeList<SyncPlaylist>(v?.playlists).map(p => ({ ...p, tracks: sanitizeList<SyncRecord>(p.tracks) }))
});

// 核心 LWW 合并：使用 >= 确保极端并发时以最新到达的客户端为准
function mergeLWW<T extends SyncRecord>(server: T[], client: T[], mergeChildren?: (s: T, c: T) => T): T[] {
  const map = new Map<string, T>(server.map(item => [item.id, item]));
  const order = server.map(item => item.id);
  const newIds: string[] = [];

  for (const c of client) {
    const s = map.get(c.id);
    if (!s) {
      map.set(c.id, c);
      newIds.push(c.id);
    } else {
      const winner = c.update_time >= s.update_time ? c : s;
      const merged = mergeChildren ? mergeChildren(s, c) : winner;
      map.set(c.id, { ...merged, update_time: winner.update_time, is_deleted: winner.is_deleted });
    }
  }
  return [...newIds, ...order].map(id => map.get(id)!);
}

function gcSyncData(data: ReturnType<typeof sanitizeSyncData>, now: number) {
  const gc = <T extends SyncRecord>(list: T[]) => list.filter(r => !(r.is_deleted && now - r.update_time > TOMBSTONE_TTL_MS));
  return {
    ...data,
    favorites: gc(data.favorites),
    playlists: gc(data.playlists).map(p => ({ ...p, tracks: gc(p.tracks) }))
  };
}

/* ---------------- 路由鉴权 ---------------- */

const syncAuthMiddleware = async (c: any, next: Function) => {
  const match = c.req.header("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (!match) return fail(c, "Invalid Authorization", 401);
  c.set("syncKey", match[1]);
  c.set("kvKey", `${SYNC_KEY_PREFIX}${match[1]}`);
  await next();
};

/* ===============================
 * 客户端 API
 * =============================== */
syncRoutesV2.use("/", syncAuthMiddleware);
syncRoutesV2.use("/pull", syncAuthMiddleware);
syncRoutesV2.use("/check", syncAuthMiddleware);

syncRoutesV2.get("/check", async (c) => {
  const { metadata } = await c.env.oh_file_url.getWithMetadata<SyncKeyMetadata>(c.get("kvKey"));
  if (metadata === null) return fail(c, "Sync key not found", 404);
  return ok(c, { lastSyncTime: metadata?.lastSyncTime ?? 0 });
});

syncRoutesV2.get("/pull", async (c) => {
  const kv = c.env.oh_file_url;
  const { value, metadata } = await kv.getWithMetadata<SyncKeyMetadata>(c.get("kvKey"));
  if (value === null) return fail(c, "Sync key not found", 404);

  const serverTime = metadata?.lastSyncTime ?? 0;
  const cleanedData = gcSyncData(sanitizeSyncData(await deserializeFromKV(value)), Date.now());

  return ok(c, { data: cleanedData, lastSyncTime: serverTime });
});

syncRoutesV2.post(
  "/",
  zValidator("json", z.object({ data: z.any() })),
  async (c) => {
    const kv = c.env.oh_file_url;
    const kvKey = c.get("kvKey");
    const { data: clientRaw } = c.req.valid("json");

    const existing = await kv.get(kvKey);
    if (existing === null) return fail(c, "Sync key not found", 404);

    const now = Date.now();
    const serverData = gcSyncData(sanitizeSyncData(await deserializeFromKV(existing)), now);
    const clientData = gcSyncData(sanitizeSyncData(clientRaw), now);

    const mergedData = {
      ...serverData,
      ...clientData,
      favorites: mergeLWW(serverData.favorites, clientData.favorites),
      playlists: mergeLWW(serverData.playlists, clientData.playlists, (s, c) => {
        return c.update_time >= s.update_time ? c : s;
      }),
    };

    const newVersion = Date.now();
    await kv.put(kvKey, await serializeForKV(mergedData), {
      metadata: { lastSyncTime: newVersion } satisfies SyncKeyMetadata,
    });

    return ok(c, { data: mergedData, lastSyncTime: newVersion }, "Sync successful");
  }
);

/* ===============================
 * 管理端 API
 * =============================== */
syncRoutesV2.post("/create-key", authMiddleware, zValidator("json", z.object({ prefix: z.string().min(1).max(20).regex(/^[a-z0-9_-]+$/i).optional() })), async (c) => {
  const { prefix } = c.req.valid("json");
  const kv = c.env.oh_file_url;
  for (let i = 0; i < 5; i++) {
    const syncKey = generateKey(prefix);
    const kvKey = `${SYNC_KEY_PREFIX}${syncKey}`;
    if (!(await kv.get(kvKey))) {
      await kv.put(kvKey, "", { metadata: { lastSyncTime: 0 } });
      return ok(c, { syncKey }, "Sync key created");
    }
  }
  return fail(c, "Failed to generate unique key", 500);
});

syncRoutesV2.get("/keys", authMiddleware, async (c) => {
  const kv = c.env.oh_file_url;
  const keys: Array<{ key: string; lastSyncTime: number }> = [];
  let cursor: string | undefined;
  do {
    const result = await kv.list({ prefix: SYNC_KEY_PREFIX, cursor });
    for (const key of result.keys) {
      keys.push({ key: key.name.replace(SYNC_KEY_PREFIX, ""), lastSyncTime: (key.metadata as SyncKeyMetadata)?.lastSyncTime ?? 0 });
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return ok(c, { keys });
});

syncRoutesV2.delete("/keys/:key", authMiddleware, async (c) => {
  const syncKey = c.req.param("key");
  const kvKey = `${SYNC_KEY_PREFIX}${syncKey}`;
  const kv = c.env.oh_file_url;
  if (await kv.get(kvKey) === null) return fail(c, "Sync key not found", 404);
  await kv.delete(kvKey);
  return ok(c, null, "Sync key deleted");
});