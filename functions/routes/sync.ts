import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { Env } from "../types/hono";
import { ok, fail } from "@utils/response";
import { authMiddleware } from "middleware/auth";
import { SYNC_KEY_PREFIX, SyncKeyMetadata } from "@shared/types";

/** ===============================
 *  Otter Music Sync (API-Key Model)
 *  一个 key = 一个同步空间
 *  =============================== */


export const syncRoutes = new Hono<{ Bindings: Env }>();

/* ---------------- 工具函数 ---------------- */

/** 拼接 KV key */
function getSyncKey(syncKey: string): string {
  return `${SYNC_KEY_PREFIX}${syncKey}`;
}

/** 严格解析 Bearer */
function getBearer(c: any): string | null {
  const auth = c.req.header("Authorization");
  if (!auth) return null;

  const match = auth.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}

/** 易读字符集（排除 0O1Il 避免混淆） */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 生成指定长度的随机码 */
function randomCode(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

/** 生成同步 key，支持可选前缀 */
function generateKey(prefix?: string): string {
  const code = randomCode(16);
  return prefix ? `${prefix}_${code}` : code;
}

/** prefix 校验 schema */
const prefixSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[a-z0-9_-]+$/i);

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type SyncRecord = {
  id: string;
  update_time: number;
  is_deleted: boolean;
} & Record<string, any>;

type SyncPlaylist = SyncRecord & {
  tracks: SyncRecord[];
};

function normalizeUpdateTime(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function normalizeIsDeleted(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function toObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function sanitizeRecord(value: unknown): SyncRecord | null {
  const raw = toObject(value);
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  return {
    ...raw,
    update_time: normalizeUpdateTime(raw.update_time),
    is_deleted: normalizeIsDeleted(raw.is_deleted),
  };
}

function sanitizeRecordList(value: unknown): SyncRecord[] {
  if (!Array.isArray(value)) return [];
  const records: SyncRecord[] = [];
  for (const item of value) {
    const record = sanitizeRecord(item);
    if (record) records.push(record);
  }
  return records;
}

function sanitizePlaylist(value: unknown): SyncPlaylist | null {
  const playlist = sanitizeRecord(value);
  if (!playlist) return null;
  return {
    ...playlist,
    tracks: sanitizeRecordList((playlist as Record<string, any>).tracks),
  };
}

function sanitizePlaylistList(value: unknown): SyncPlaylist[] {
  if (!Array.isArray(value)) return [];
  const playlists: SyncPlaylist[] = [];
  for (const item of value) {
    const playlist = sanitizePlaylist(item);
    if (playlist) playlists.push(playlist);
  }
  return playlists;
}

function sanitizeSyncData(value: unknown): Record<string, any> & {
  favorites: SyncRecord[];
  playlists: SyncPlaylist[];
} {
  const data = toObject(value);
  return {
    ...data,
    favorites: sanitizeRecordList(data.favorites),
    playlists: sanitizePlaylistList(data.playlists),
  };
}

function shouldGcRecord(record: SyncRecord, now: number): boolean {
  return record.is_deleted && now - record.update_time > TOMBSTONE_TTL_MS;
}

function gcSyncData(data: ReturnType<typeof sanitizeSyncData>, now: number) {
  const favorites = data.favorites.filter((item) => !shouldGcRecord(item, now));
  const playlists: SyncPlaylist[] = [];

  for (const playlist of data.playlists) {
    if (shouldGcRecord(playlist, now)) continue;
    playlists.push({
      ...playlist,
      tracks: playlist.tracks.filter((track) => !shouldGcRecord(track, now)),
    });
  }

  return {
    ...data,
    favorites,
    playlists,
  };
}

function parseStoredData(raw: string | null): unknown {
  if (raw === null || raw === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function selectLwwRecord(serverRecord: SyncRecord, clientRecord: SyncRecord): SyncRecord {
  if (clientRecord.update_time > serverRecord.update_time) return clientRecord;
  return serverRecord;
}

function mergeRecordList(serverRecords: SyncRecord[], clientRecords: SyncRecord[]): SyncRecord[] {
  const mergedMap = new Map<string, SyncRecord>();
  const order: string[] = [];

  for (const record of serverRecords) {
    mergedMap.set(record.id, record);
    order.push(record.id);
  }

  for (const record of clientRecords) {
    const existing = mergedMap.get(record.id);
    if (!existing) {
      mergedMap.set(record.id, record);
      order.push(record.id);
      continue;
    }
    mergedMap.set(record.id, selectLwwRecord(existing, record));
  }

  return order.map((id) => mergedMap.get(id)!);
}

function mergePlaylistList(serverPlaylists: SyncPlaylist[], clientPlaylists: SyncPlaylist[]): SyncPlaylist[] {
  const mergedMap = new Map<string, SyncPlaylist>();
  const order: string[] = [];

  for (const playlist of serverPlaylists) {
    mergedMap.set(playlist.id, playlist);
    order.push(playlist.id);
  }

  for (const playlist of clientPlaylists) {
    const existing = mergedMap.get(playlist.id);
    if (!existing) {
      mergedMap.set(playlist.id, playlist);
      order.push(playlist.id);
      continue;
    }
    const mergedTracks = mergeRecordList(existing.tracks, playlist.tracks);
    const winner = selectLwwRecord(existing, playlist) as SyncPlaylist;
    mergedMap.set(playlist.id, {
      ...winner,
      tracks: mergedTracks,
    });
  }

  return order.map((id) => mergedMap.get(id)!);
}

function mergeSyncData(
  serverData: ReturnType<typeof sanitizeSyncData>,
  clientData: ReturnType<typeof sanitizeSyncData>,
) {
  return {
    ...serverData,
    ...clientData,
    favorites: mergeRecordList(serverData.favorites, clientData.favorites),
    playlists: mergePlaylistList(serverData.playlists, clientData.playlists),
  };
}

/* ===============================
 * GET /sync/check  检查同步状态
 * =============================== */
syncRoutes.get("/check", async (c) => {
  const syncKey = getBearer(c);
  if (!syncKey) return fail(c, "Invalid Authorization", 401);

  const kv = c.env.oh_file_url;
  const kvKey = getSyncKey(syncKey);

  const { metadata } = await kv.getWithMetadata<SyncKeyMetadata>(kvKey);

  if (metadata === null) {
    return fail(c, "Sync key not found", 404);
  }

  return ok(c, {
    lastSyncTime: metadata?.lastSyncTime ?? 0,
  });
});

/* ===============================
 * GET /sync  拉取数据
 * =============================== */
syncRoutes.get("/", async (c) => {
  const syncKey = getBearer(c);
  if (!syncKey) return fail(c, "Invalid Authorization", 401);

  const kv = c.env.oh_file_url;
  const kvKey = getSyncKey(syncKey);

  const { value, metadata } = await kv.getWithMetadata<SyncKeyMetadata>(kvKey);

  if (value === null) {
    return fail(c, "Sync key not found", 404);
  }

  const serverTime = metadata?.lastSyncTime ?? 0;
  const now = Date.now();
  const sanitizedData = sanitizeSyncData(parseStoredData(value));
  const gcData = gcSyncData(sanitizedData, now);

  if (JSON.stringify(gcData) !== JSON.stringify(sanitizedData)) {
    await kv.put(kvKey, JSON.stringify(gcData), {
      metadata: { lastSyncTime: serverTime } satisfies SyncKeyMetadata,
    });
  }

  return ok(c, {
    data: gcData,
    lastSyncTime: serverTime,
  });
});

/* ===============================
 * POST /sync  推送数据
 * 记录级 LWW 合并
 * =============================== */
syncRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      data: z.any(),
      lastSyncTime: z.number().optional(),
    }),
  ),
  async (c) => {
    const syncKey = getBearer(c);
    if (!syncKey) return fail(c, "Invalid Authorization", 401);

    const kv = c.env.oh_file_url;
    const kvKey = getSyncKey(syncKey);

    const body = c.req.valid("json");

    const existing = await kv.getWithMetadata<SyncKeyMetadata>(kvKey);

    if (existing.value === null) {
      return fail(c, "Sync key not found", 404);
    }

    const now = Date.now();
    const serverData = gcSyncData(sanitizeSyncData(parseStoredData(existing.value)), now);
    const clientData = gcSyncData(sanitizeSyncData(body.data), now);
    const mergedData = mergeSyncData(serverData, clientData);

    const newTime = Date.now();

    await kv.put(kvKey, JSON.stringify(mergedData), {
      metadata: { lastSyncTime: newTime } satisfies SyncKeyMetadata,
    });

    return ok(c, { lastSyncTime: newTime }, "Sync successful");
  },
);

/* ===============================
 * POST /create-key  管理员创建同步空间
 * =============================== */
syncRoutes.post(
  "/create-key",
  authMiddleware,
  zValidator(
    "json",
    z.object({
      prefix: prefixSchema.optional(),
    }),
  ),
  async (c) => {
    const { prefix } = c.req.valid("json");
    const kv = c.env.oh_file_url;

    for (let i = 0; i < 5; i++) {
      const syncKey = generateKey(prefix);
      const kvKey = getSyncKey(syncKey);

      const exists = await kv.get(kvKey);
      if (!exists) {
        await kv.put(kvKey, "", {
          metadata: { lastSyncTime: 0 },
        });
        return ok(c, { syncKey }, "Sync key created");
      }
    }

    return fail(c, "Failed to generate unique key", 500);
  },
);

/* ===============================
 * GET /sync/keys  列出所有 SyncKey
 * =============================== */
syncRoutes.get("/keys", authMiddleware, async (c) => {
  const kv = c.env.oh_file_url;
  const keys: Array<{ key: string; lastSyncTime: number }> = [];

  let cursor: string | undefined;
  do {
    const result = await kv.list({ prefix: SYNC_KEY_PREFIX, cursor });
    for (const key of result.keys) {
      const metadata = key.metadata as SyncKeyMetadata | undefined;
      keys.push({
        key: key.name.replace(SYNC_KEY_PREFIX, ""),
        lastSyncTime: metadata?.lastSyncTime ?? 0,
      });
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  return ok(c, { keys });
});

/* ===============================
 * DELETE /sync/keys/:key  删除 SyncKey
 * =============================== */
syncRoutes.delete("/keys/:key", authMiddleware, async (c) => {
  const syncKey = c.req.param("key");
  if (!syncKey) {
    return fail(c, "Key is required", 400);
  }

  const kv = c.env.oh_file_url;
  const kvKey = getSyncKey(syncKey);

  const exists = await kv.get(kvKey);
  if (!exists && exists !== "") {
    return fail(c, "Sync key not found", 404);
  }

  await kv.delete(kvKey);
  return ok(c, null, "Sync key deleted");
});
