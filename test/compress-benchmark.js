/**
 * KV ArrayBuffer 压缩效果评估脚本
 * 用法: node test/compress-benchmark.js
 */
const zlib = require("zlib");

/* ---------------- 1. 模拟数据生成 ---------------- */
const SOURCES = ["netease", "joox", "kuwo", "bilibili", "migu", "spotify"];

const makeTrack = (i) => ({
  id: `trk_${10000000 + i}`,
  name: `测试歌曲 ${i} 的超长完整标题文本展示`,
  artist: [`歌手${i % 50}`, `歌手${(i + 1) % 50}`],
  album: `专辑名称精选辑 ${i % 100}`,
  pic_id: String(20000000 + i),
  url_id: String(30000000 + i),
  lyric_id: String(40000000 + i),
  source: SOURCES[i % SOURCES.length],
  is_deleted: false,
  update_time: Date.now() - (i % 1000) * 1000,
});

const makeSyncData = (favCount, plCount, tracksPerPl) => ({
  favorites: Array.from({ length: favCount }, (_, i) => makeTrack(i)),
  playlists: Array.from({ length: plCount }, (_, i) => ({
    id: `pl_${i + 1}`,
    name: `我的精品歌单 ${i + 1}`,
    tracks: Array.from({ length: tracksPerPl }, (_, j) => makeTrack(j + (i + 1) * 10000)),
    createdAt: Date.now() - i * 86400000,
    is_deleted: false,
    update_time: Date.now() - i * 1000,
  })),
});

/* ---------------- 2. 空间对比评估 ---------------- */
const SCENARIOS = [
  ["极轻用户 (5首)", makeSyncData(5, 0, 0)],
  ["轻量用户 (50+40首)", makeSyncData(50, 2, 20)],
  ["普通用户 (200+250首)", makeSyncData(200, 5, 50)],
  ["重度用户 (500+1000首)", makeSyncData(500, 10, 100)],
  ["骨灰用户 (2000+4000首)", makeSyncData(2000, 20, 200)],
  ["极限用户 (1w+40单×1000首)", makeSyncData(10000, 40, 1000)], // 总计 5w 首
];

console.log("================ 1. KV 存储大小对比 ================");
SCENARIOS.forEach(([label, data]) => {
  const json = JSON.stringify(data);
  const origBytes = Buffer.byteLength(json, "utf8");
  const deflated = zlib.deflateRawSync(json, { level: 6 });
  const arrayBufBytes = 1 + deflated.length;
  const base64Bytes = Buffer.byteLength(deflated.toString("base64"), "utf8");

  const ratioVsOrig = (((origBytes - arrayBufBytes) / origBytes) * 100).toFixed(1);
  const savedVsBase64 = (((base64Bytes - arrayBufBytes) / base64Bytes) * 100).toFixed(1);

  console.log(
    `[${label.padEnd(24)}] 原始: ${(origBytes / 1024).toFixed(2).padStart(8)} KB` +
    ` | ArrayBuf: ${(arrayBufBytes / 1024).toFixed(2).padStart(8)} KB (-${ratioVsOrig}%)` +
    ` | base64旧节省: ${savedVsBase64}%`
  );
});

/* ---------------- 3. 耗时与性能基准 ---------------- */
const btoaJsStyle = (buf) => btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
const RUNS = 10; // 降低循环次数以兼顾 5w 首超大数据的测试耗时

function timeit(label, data) {
  const json = JSON.stringify(data);
  const origMB = Buffer.byteLength(json, "utf8") / 1024 / 1024;
  const deflated = zlib.deflateRawSync(json, { level: 6 });
  const deflatedU8 = new Uint8Array(deflated);

  const measure = (fn) => {
    const start = performance.now();
    for (let i = 0; i < RUNS; i++) fn();
    return (performance.now() - start) / RUNS;
  };

  const newWriteMs = measure(() => zlib.deflateRawSync(json, { level: 6 }));
  const oldWriteMs = measure(() => btoaJsStyle(new Uint8Array(zlib.deflateRawSync(json, { level: 6 }))));
  
  const newReadMs = measure(() => zlib.inflateRawSync(deflated));
  const b64 = btoaJsStyle(deflatedU8);
  const oldReadMs = measure(() => zlib.inflateRawSync(Buffer.from(atob(b64), 'binary')));

  console.log(`\n[${label}] 数据量: ${origMB.toFixed(2)} MB`);
  console.log(`  写入 节省: ${((1 - newWriteMs / oldWriteMs) * 100).toFixed(1)}% (新: ${newWriteMs.toFixed(2)}ms)`);
  console.log(`  读取 节省: ${((1 - newReadMs / oldReadMs) * 100).toFixed(1)}% (新: ${newReadMs.toFixed(2)}ms)`);
}

console.log("\n================ 2. 耗时对比 (Worker模拟, 10次求均值) ================");
timeit("重度用户 (1500首)", SCENARIOS[3][1]);
timeit("骨灰用户 (6000首)", SCENARIOS[4][1]);
timeit("极限用户 (50000首)", SCENARIOS[5][1]);