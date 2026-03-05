var assert = require("assert");

const API_URL = "http://localhost:8080";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

async function loginAndGetCookie() {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  assert.equal(res.status, 200, "Login failed");
  const match = (res.headers.get("set-cookie") || "").match(/auth=[^;]+/);
  assert.ok(match, "Missing auth cookie");
  return match[0];
}

async function fetchApi(path, { cookie, bearer, json, headers = {}, ...rest } = {}) {
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) headers["Content-Type"] = "application/json";

  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
}

// 提取公共请求与断言逻辑
async function fetchJson(path, options = {}, expectStatus = 200) {
  const res = await fetchApi(path, options);
  assert.equal(res.status, expectStatus, `Expected ${expectStatus} for ${path}`);
  const data = await res.json();
  if (expectStatus === 200) assert.ok(data.success, `API success flag false for ${path}`);
  return data;
}

// LWW 测试数据工厂
const mockTrackItem = (id, update_time, is_deleted = false, extra = {}) => ({ id, update_time, is_deleted, ...extra });
const mockPlaylist = (id, update_time, is_deleted = false, tracks = [], extra = {}) => ({ id, update_time, is_deleted, tracks, ...extra });

describe("Sync API", function () {
  this.timeout(30000);

  let createdKey, testKeyWithPrefix, adminCookie;
  
  // 封装快捷推送方法
  const pushSyncData = (bearer, data) => fetchJson(`/sync`, { method: "POST", bearer, cookie: adminCookie, json: { data } });
  const pullSyncData = (bearer) => fetchJson(`/sync`, { bearer, cookie: adminCookie });

  before(async function () {
    adminCookie = await loginAndGetCookie();
  });

  after(async function () {
    for (const key of [createdKey, testKeyWithPrefix]) {
      if (key) await fetchApi(`/sync/keys/${key}`, { method: "DELETE", cookie: adminCookie });
    }
  });

  describe("POST /sync/create-key", function () {
    it("should create key without prefix", async function () {
      const { data } = await fetchJson(`/sync/create-key`, { method: "POST", cookie: adminCookie, json: {} });
      assert.ok(data.syncKey);
      createdKey = data.syncKey;
    });

    it("should create key with prefix", async function () {
      const { data } = await fetchJson(`/sync/create-key`, { method: "POST", cookie: adminCookie, json: { prefix: "test" } });
      assert.ok(data.syncKey.startsWith("test_"));
      testKeyWithPrefix = data.syncKey;
    });

    it("should fail with invalid prefix", async function () {
      await fetchJson(`/sync/create-key`, { method: "POST", cookie: adminCookie, json: { prefix: "invalid prefix" } }, 400);
      await fetchJson(`/sync/create-key`, { method: "POST", cookie: adminCookie, json: { prefix: "a".repeat(21) } }, 400);
    });
  });

  describe("GET /sync/keys", function () {
    it("should list all keys", async function () {
      const { data } = await fetchJson(`/sync/keys`, { cookie: adminCookie });
      const keys = data.keys.map(k => k.key);
      assert.ok(keys.includes(createdKey) && keys.includes(testKeyWithPrefix));
    });
  });

  describe("GET /sync (Bearer Auth)", function () {
    it("should check sync status", async function () {
      const { data } = await fetchJson(`/sync/check`, { bearer: createdKey, cookie: adminCookie });
      assert.ok(typeof data.lastSyncTime === "number");
    });

    it("should fetch empty data", async function () {
      const { data } = await pullSyncData(createdKey);
      assert.deepEqual(data.data, { favorites: [], playlists: [] });
    });

    it("should fail with invalid authorization", async function () {
      await fetchJson(`/sync`, { bearer: "invalid_key", cookie: adminCookie }, 404);
      await fetchJson(`/sync`, { cookie: adminCookie }, 401);
      await fetchJson(`/sync`, { cookie: adminCookie, headers: { Authorization: "InvalidBearer x" } }, 401);
    });
  });

  describe("POST /sync (Push Data)", function () {
    it("should push and fetch data successfully", async function () {
      await pushSyncData(createdKey, { test: "hello" });
      
      const { data } = await pullSyncData(createdKey);
      assert.deepEqual(data.data, { favorites: [], playlists: [], test: "hello" });
    });
  });

  describe("POST /sync (LWW + Tombstone)", function () {
    let lwwKey;

    beforeEach(async function () {
      const { data } = await fetchJson(`/sync/create-key`, { method: "POST", cookie: adminCookie, json: { prefix: "lww" } });
      lwwKey = data.syncKey;
    });

    afterEach(async function () {
      if (lwwKey) await fetchApi(`/sync/keys/${lwwKey}`, { method: "DELETE", cookie: adminCookie });
    });

    it("should keep tombstone when stale live record arrives", async function () {
      const baseTs = Date.now();
      await pushSyncData(lwwKey, { favorites: [mockTrackItem("fav_tomb_1", baseTs, false)], playlists: [] });
      await pushSyncData(lwwKey, { favorites: [mockTrackItem("fav_tomb_1", baseTs + 5000, true)], playlists: [] });
      await pushSyncData(lwwKey, { favorites: [mockTrackItem("fav_tomb_1", baseTs + 3000, false)], playlists: [] }); // Stale

      const { data: { data } } = await pullSyncData(lwwKey);
      const item = data.favorites.find((it) => it.id === "fav_tomb_1");
      assert.ok(item && item.is_deleted && item.update_time === baseTs + 5000);
    });

    it("should keep newer update_time on concurrent edits", async function () {
      await pushSyncData(lwwKey, { favorites: [mockTrackItem("fav_lww_1", 3000, false, { name: "newer" })] });
      await pushSyncData(lwwKey, { favorites: [mockTrackItem("fav_lww_1", 2500, false, { name: "older" })] }); // Stale

      const { data: { data } } = await pullSyncData(lwwKey);
      const item = data.favorites.find((it) => it.id === "fav_lww_1");
      assert.ok(item && item.name === "newer" && item.update_time === 3000);
    });

    it("should keep playlist when B modifies after A deletes (LWW revive)", async function () {
      const baseTs = Date.now();
      await pushSyncData(lwwKey, { playlists: [mockPlaylist("pl_conflict_1", baseTs + 1000, true, [], { name: "deleted_by_A" })] });
      await pushSyncData(lwwKey, { playlists: [mockPlaylist("pl_conflict_1", baseTs + 2000, false, [], { name: "revived_by_B" })] });

      const { data: { data } } = await pullSyncData(lwwKey);
      const playlist = data.playlists.find((it) => it.id === "pl_conflict_1");
      assert.ok(playlist && !playlist.is_deleted && playlist.name === "revived_by_B");
    });

    it("should gc tombstones older than 30 days and keep recent", async function () {
      const now = Date.now();
      const oldTs = now - 31 * 24 * 60 * 60 * 1000;
      const recentTs = now - 7 * 24 * 60 * 60 * 1000;

      await pushSyncData(lwwKey, {
        favorites: [mockTrackItem("fav_gc_old", oldTs, true), mockTrackItem("fav_gc_keep", recentTs, true)],
        playlists: [mockPlaylist("pl_gc_1", now, false, [mockTrackItem("trk_old", oldTs, true), mockTrackItem("trk_keep", recentTs, true)])],
      });

      const { data: { data } } = await pullSyncData(lwwKey);
      assert.ok(!data.favorites.some(it => it.id === "fav_gc_old"));
      assert.ok(data.favorites.some(it => it.id === "fav_gc_keep"));
      
      const pl = data.playlists.find(it => it.id === "pl_gc_1");
      assert.ok(!pl.tracks.some(it => it.id === "trk_old"));
      assert.ok(pl.tracks.some(it => it.id === "trk_keep"));
    });

    it("should backfill missing fields for legacy payload", async function () {
      await pushSyncData(lwwKey, {
        favorites: [{ id: "legacy_fav_1" }],
        playlists: [{ id: "legacy_pl_1", tracks: [{ id: "legacy_track_1" }] }],
      });

      const { data: { data } } = await pullSyncData(lwwKey);
      const fav = data.favorites.find(it => it.id === "legacy_fav_1");
      const pl = data.playlists.find(it => it.id === "legacy_pl_1");
      assert.ok(fav.update_time === 0 && !fav.is_deleted);
      assert.ok(pl.update_time === 0 && !pl.is_deleted && pl.tracks[0].update_time === 0);
    });

    it("should stay stable on repeated same payload", async function () {
      const payload = { favorites: [mockTrackItem("idem_fav_1", 9999)], playlists: [] };
      await pushSyncData(lwwKey, payload);
      await pushSyncData(lwwKey, payload);

      const { data: { data } } = await pullSyncData(lwwKey);
      const matched = data.favorites.filter(it => it.id === "idem_fav_1");
      assert.equal(matched.length, 1);
      assert.equal(matched[0].update_time, 9999);
    });
  });

  describe("DELETE /sync/keys/:key", function () {
    it("should delete key and verify missing", async function () {
      await fetchJson(`/sync/keys/${createdKey}`, { method: "DELETE", cookie: adminCookie });
      await fetchJson(`/sync`, { bearer: createdKey, cookie: adminCookie }, 404);
      createdKey = null; // 标记已删除避免重复清理
    });

    it("should fail to delete non-existent key", async function () {
      await fetchJson(`/sync/keys/non_existent_key_123`, { method: "DELETE", cookie: adminCookie }, 404);
    });
  });
});