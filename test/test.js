var assert = require("assert");

const API_URL = "http://localhost:8080";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

async function loginAndGetCookie() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });

  assert.equal(response.status, 200);

  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/auth=[^;]+/);
  assert.ok(match, `Missing auth cookie, set-cookie: ${setCookie}`);
  return match[0];
}

async function fetchApi(path, options = {}) {
  const { cookie, bearer, json, headers: extraHeaders, ...rest } = options;
  const headers = { ...(extraHeaders || {}) };

  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (cookie) headers.Cookie = cookie;

  const hasJson = json !== undefined;
  if (hasJson) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: hasJson ? JSON.stringify(json) : rest.body,
  });
}

describe("Sync API", function () {
  this.timeout(30000);

  let createdKey;
  let testKeyWithPrefix;
  let adminCookie;

  before(async function () {
    adminCookie = await loginAndGetCookie();
  });

  describe("POST /sync/create-key", function () {
    it("should create key without prefix", async function () {
      const response = await fetchApi(`/sync/create-key`, {
        method: "POST",
        cookie: adminCookie,
        json: {},
      });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(result.data.syncKey);
      createdKey = result.data.syncKey;
    });

    it("should create key with prefix", async function () {
      const response = await fetchApi(`/sync/create-key`, {
        method: "POST",
        cookie: adminCookie,
        json: { prefix: "test" },
      });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(result.data.syncKey.startsWith("test_"));
      testKeyWithPrefix = result.data.syncKey;
    });

    it("should fail with invalid prefix", async function () {
      const response = await fetchApi(`/sync/create-key`, {
        method: "POST",
        cookie: adminCookie,
        json: { prefix: "invalid prefix" },
      });

      assert.equal(response.status, 400);
      const result = await response.json();
      assert.ok(!result.success);
    });

    it("should fail with too long prefix", async function () {
      const longPrefix = "a".repeat(21);
      const response = await fetchApi(`/sync/create-key`, {
        method: "POST",
        cookie: adminCookie,
        json: { prefix: longPrefix },
      });

      assert.equal(response.status, 400);
      const result = await response.json();
      assert.ok(!result.success);
    });
  });

  describe("GET /sync/keys", function () {
    it("should list all keys", async function () {
      const response = await fetchApi(`/sync/keys`, { cookie: adminCookie });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(Array.isArray(result.data.keys));
      assert.ok(result.data.keys.length >= 2);
      
      // 验证创建的键存在于列表中
      const keys = result.data.keys.map(k => k.key);
      assert.ok(keys.includes(createdKey));
      assert.ok(keys.includes(testKeyWithPrefix));
    });
  });

  describe("GET /sync (Bearer Auth)", function () {
    it("should check sync status", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync/check`, { bearer: createdKey, cookie: adminCookie });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(typeof result.data.lastSyncTime === "number");
    });

    it("should fetch empty data", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync`, { bearer: createdKey, cookie: adminCookie });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.deepEqual(result.data.data, { favorites: [], playlists: [] });
    });

    it("should fail with invalid key", async function () {
      const response = await fetchApi(`/sync`, { bearer: "invalid_key", cookie: adminCookie });

      assert.equal(response.status, 404);
    });

    it("should fail without authorization header", async function () {
      const response = await fetchApi(`/sync`, { cookie: adminCookie });

      assert.equal(response.status, 401);
    });

    it("should fail with malformed authorization header", async function () {
      const response = await fetchApi(`/sync`, {
        cookie: adminCookie,
        headers: { Authorization: "InvalidBearer invalid_key" },
      });

      assert.equal(response.status, 401);
    });
  });

  describe("POST /sync (Push Data)", function () {
    it("should push data successfully", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync`, {
        method: "POST",
        bearer: createdKey,
        cookie: adminCookie,
        json: { data: { test: "hello" } },
      });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      assert.ok(result.data.lastSyncTime);
    });

    it("should fetch pushed data", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync`, { bearer: createdKey, cookie: adminCookie });

      assert.equal(response.status, 200);
      const result = await response.json();
      assert.deepEqual(result.data.data, { favorites: [], playlists: [], test: "hello" });
    });

    it("should push data with valid lastSyncTime", async function () {
      if (!createdKey) this.skip();

      // 获取当前同步时间
      const statusResponse = await fetchApi(`/sync/check`, { bearer: createdKey, cookie: adminCookie });
      const statusResult = await statusResponse.json();
      const currentSyncTime = statusResult.data.lastSyncTime;

      // 推送数据，使用正确的 lastSyncTime
      const pushResponse = await fetchApi(`/sync`, {
        method: "POST",
        bearer: createdKey,
        cookie: adminCookie,
        json: { data: { version: 3 }, lastSyncTime: currentSyncTime },
      });

      assert.equal(pushResponse.status, 200);
      const pushResult = await pushResponse.json();
      assert.ok(pushResult.success);
      assert.ok(pushResult.data.lastSyncTime > currentSyncTime);
    });
  });

  describe("POST /sync (LWW + Tombstone)", function () {
    let lwwKey;

    before(async function () {
      const response = await fetchApi(`/sync/create-key`, {
        method: "POST",
        cookie: adminCookie,
        json: { prefix: "lww" },
      });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.ok(result.success);
      lwwKey = result.data.syncKey;
    });

    after(async function () {
      if (!lwwKey) return;
      const response = await fetchApi(`/sync/keys/${lwwKey}`, {
        method: "DELETE",
        cookie: adminCookie,
      });
      assert.equal(response.status, 200);
    });

    it("should keep tombstone when stale live record arrives", async function () {
      if (!lwwKey) this.skip();
      const baseTs = Date.now();

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "fav_tomb_1",
              name: "n",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
              update_time: baseTs,
              is_deleted: false,
            }],
            playlists: [],
          },
        },
      });

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "fav_tomb_1",
              name: "n",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
              update_time: baseTs + 5000,
              is_deleted: true,
            }],
            playlists: [],
          },
        },
      });

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "fav_tomb_1",
              name: "n2",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
              update_time: baseTs + 3000,
              is_deleted: false,
            }],
            playlists: [],
          },
        },
      });

      const pullResponse = await fetchApi(`/sync`, { bearer: lwwKey, cookie: adminCookie });
      const pullResult = await pullResponse.json();
      const item = pullResult.data.data.favorites.find((it) => it.id === "fav_tomb_1");
      assert.ok(item);
      assert.equal(item.is_deleted, true);
      assert.equal(item.update_time, baseTs + 5000);
    });

    it("should keep newer update_time on concurrent edits", async function () {
      if (!lwwKey) this.skip();

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "fav_lww_1",
              name: "newer",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
              update_time: 3000,
              is_deleted: false,
            }],
            playlists: [],
          },
        },
      });

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "fav_lww_1",
              name: "older",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
              update_time: 2500,
              is_deleted: false,
            }],
            playlists: [],
          },
        },
      });

      const pullResponse = await fetchApi(`/sync`, { bearer: lwwKey, cookie: adminCookie });
      const pullResult = await pullResponse.json();
      const item = pullResult.data.data.favorites.find((it) => it.id === "fav_lww_1");
      assert.ok(item);
      assert.equal(item.name, "newer");
      assert.equal(item.update_time, 3000);
    });

    it("should gc tombstones older than 30 days and keep recent tombstones", async function () {
      if (!lwwKey) this.skip();

      const now = Date.now();
      const oldTs = now - 31 * 24 * 60 * 60 * 1000;
      const recentTs = now - 7 * 24 * 60 * 60 * 1000;

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [
              {
                id: "fav_gc_old",
                name: "old",
                artist: [],
                album: "",
                pic_id: "",
                url_id: "",
                lyric_id: "",
                source: "netease",
                update_time: oldTs,
                is_deleted: true,
              },
              {
                id: "fav_gc_keep",
                name: "keep",
                artist: [],
                album: "",
                pic_id: "",
                url_id: "",
                lyric_id: "",
                source: "netease",
                update_time: recentTs,
                is_deleted: true,
              },
            ],
            playlists: [
              {
                id: "pl_gc_1",
                name: "gc",
                createdAt: now,
                update_time: now,
                is_deleted: false,
                tracks: [
                  {
                    id: "pl_track_old",
                    name: "old",
                    artist: [],
                    album: "",
                    pic_id: "",
                    url_id: "",
                    lyric_id: "",
                    source: "netease",
                    update_time: oldTs,
                    is_deleted: true,
                  },
                  {
                    id: "pl_track_keep",
                    name: "keep",
                    artist: [],
                    album: "",
                    pic_id: "",
                    url_id: "",
                    lyric_id: "",
                    source: "netease",
                    update_time: recentTs,
                    is_deleted: true,
                  },
                ],
              },
            ],
          },
        },
      });

      const pullResponse = await fetchApi(`/sync`, { bearer: lwwKey, cookie: adminCookie });
      const pullResult = await pullResponse.json();
      const favorites = pullResult.data.data.favorites;
      assert.equal(favorites.some((it) => it.id === "fav_gc_old"), false);
      assert.equal(favorites.some((it) => it.id === "fav_gc_keep"), true);

      const playlist = pullResult.data.data.playlists.find((it) => it.id === "pl_gc_1");
      assert.ok(playlist);
      assert.equal(playlist.tracks.some((it) => it.id === "pl_track_old"), false);
      assert.equal(playlist.tracks.some((it) => it.id === "pl_track_keep"), true);
    });

    it("should backfill missing fields for legacy payload", async function () {
      if (!lwwKey) this.skip();

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: {
          data: {
            favorites: [{
              id: "legacy_fav_1",
              name: "legacy",
              artist: [],
              album: "",
              pic_id: "",
              url_id: "",
              lyric_id: "",
              source: "netease",
            }],
            playlists: [{
              id: "legacy_pl_1",
              name: "legacy",
              createdAt: 1,
              tracks: [{
                id: "legacy_track_1",
                name: "legacy",
                artist: [],
                album: "",
                pic_id: "",
                url_id: "",
                lyric_id: "",
                source: "netease",
              }],
            }],
          },
        },
      });

      const pullResponse = await fetchApi(`/sync`, { bearer: lwwKey, cookie: adminCookie });
      const pullResult = await pullResponse.json();

      const favorite = pullResult.data.data.favorites.find((it) => it.id === "legacy_fav_1");
      assert.ok(favorite);
      assert.equal(favorite.update_time, 0);
      assert.equal(favorite.is_deleted, false);

      const playlist = pullResult.data.data.playlists.find((it) => it.id === "legacy_pl_1");
      assert.ok(playlist);
      assert.equal(playlist.update_time, 0);
      assert.equal(playlist.is_deleted, false);

      const track = playlist.tracks.find((it) => it.id === "legacy_track_1");
      assert.ok(track);
      assert.equal(track.update_time, 0);
      assert.equal(track.is_deleted, false);
    });

    it("should stay stable on repeated same payload", async function () {
      if (!lwwKey) this.skip();

      const payload = {
        favorites: [{
          id: "idem_fav_1",
          name: "idem",
          artist: [],
          album: "",
          pic_id: "",
          url_id: "",
          lyric_id: "",
          source: "netease",
          update_time: 9999,
          is_deleted: false,
        }],
        playlists: [],
      };

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: { data: payload },
      });

      await fetchApi(`/sync`, {
        method: "POST",
        bearer: lwwKey,
        cookie: adminCookie,
        json: { data: payload },
      });

      const pullResponse = await fetchApi(`/sync`, { bearer: lwwKey, cookie: adminCookie });
      const pullResult = await pullResponse.json();
      const matched = pullResult.data.data.favorites.filter((it) => it.id === "idem_fav_1");
      assert.equal(matched.length, 1);
      assert.equal(matched[0].update_time, 9999);
      assert.equal(matched[0].is_deleted, false);
    });
  });

  describe("DELETE /sync/keys/:key", function () {
    it("should delete key", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync/keys/${createdKey}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
    });

    it("key should not exist after delete", async function () {
      if (!createdKey) this.skip();

      const response = await fetchApi(`/sync`, { bearer: createdKey, cookie: adminCookie });

      assert.equal(response.status, 404);
    });

    it("should fail to delete non-existent key", async function () {
      const nonExistentKey = "non_existent_key_123";
      const response = await fetchApi(`/sync/keys/${nonExistentKey}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      assert.equal(response.status, 404);
    });
  });

  describe("Cleanup", function () {
    it("should delete test key with prefix", async function () {
      if (!testKeyWithPrefix) this.skip();

      const response = await fetchApi(`/sync/keys/${testKeyWithPrefix}`, {
        method: "DELETE",
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
    });
  });
});
