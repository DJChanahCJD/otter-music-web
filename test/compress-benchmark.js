/**
 * KV deflate 压缩效果极限评估脚本
 * 用法: node benchmark.js
 */

const zlib = require("zlib");

/* ---------------- 1. 模拟数据生成 ---------------- */

const SOURCES = ["netease", "joox", "kuwo", "bilibili", "migu", "spotify"];

const makeTrack = (i) => ({
  id: `trk_${10000000 + i}`,
  name: `测试歌曲 ${i} 的超长完整标题文本展示`,
  artist: [`歌手${i % 50}`, `歌手${(i + 1) % 50}`], // 增加随机性熵值
  album: `专辑名称精选辑 ${i % 100}`,
  pic_id: String(20000000 + i),
  url_id: String(30000000 + i),
  lyric_id: String(40000000 + i),
  source: SOURCES[i % SOURCES.length],
  is_deleted: false,
  update_time: Date.now() - (i % 1000) * 1000,
});

const makeSyncData = (favCount, playlistCount, tracksPerPl) => ({
  favorites: Array.from({ length: favCount }, (_, i) => makeTrack(i)),
  playlists: Array.from({ length: playlistCount }, (_, i) => ({
    id: `pl_${i + 1}`,
    name: `我的精品歌单 ${i + 1}`,
    tracks: Array.from({ length: tracksPerPl }, (_, j) => makeTrack(j + (i + 1) * 10000)),
    createdAt: Date.now() - i * 86400000,
    is_deleted: false,
    update_time: Date.now() - i * 1000,
  })),
});

/* ---------------- 2. 压缩率评估 ---------------- */

function evaluate(label, data) {
  const json = JSON.stringify(data);
  const origSize = Buffer.byteLength(json, "utf8");
  
  // 真实 Base64 长度 = 压缩后 Buffer 转 base64 字符串的长度
  const deflated = zlib.deflateRawSync(json, { level: 6 });
  const b64Size = Buffer.byteLength(deflated.toString("base64"), "utf8");
  
  const ratio = (((origSize - b64Size) / origSize) * 100).toFixed(2);
  const origKB = (origSize / 1024).toFixed(2).padStart(8);
  const newKB = (b64Size / 1024).toFixed(2).padStart(8);

  console.log(`[${label.padEnd(28, " ")}] 原始: ${origKB} KB | 压缩后: ${newKB} KB | 节省: ${ratio}%`);
}

console.log("================ 1. 空间压缩率评估 ================");
const SCENARIOS = [
  ["极轻用户 (5首)", makeSyncData(5, 0, 0)],
  ["轻量用户 (50首+2单×20首)", makeSyncData(50, 2, 20)],
  ["普通用户 (200首+5单×50首)", makeSyncData(200, 5, 50)],
  ["重度用户 (500首+10单×100首)", makeSyncData(500, 10, 100)],
  ["骨灰用户 (2000首+20单×200首)", makeSyncData(2000, 20, 200)],   // 扩大基数：6000条记录
  ["极限边缘 (1万首+50单×500首)", makeSyncData(10000, 50, 500)], // 极端情况：3.5万条记录，测试系统瓶颈
];

for (const [label, data] of SCENARIOS) {
  evaluate(label, data);
}

/* ---------------- 3. CPU 耗时与吞吐量评估 ---------------- */

const RUNS = 100;

function timeit(label, data) {
  const json = JSON.stringify(data);
  const origBytes = Buffer.byteLength(json, "utf8");
  const origMB = origBytes / 1024 / 1024;
  
  const deflated = zlib.deflateRawSync(json, { level: 6 });

  // 测试 Deflate
  const t0 = performance.now();
  for (let i = 0; i < RUNS; i++) zlib.deflateRawSync(json, { level: 6 });
  const deflateMs = (performance.now() - t0) / RUNS;
  const writeThroughput = (origMB / (deflateMs / 1000)).toFixed(1);

  // 测试 Inflate
  const t1 = performance.now();
  for (let i = 0; i < RUNS; i++) zlib.inflateRawSync(deflated);
  const inflateMs = (performance.now() - t1) / RUNS;
  const readThroughput = (origMB / (inflateMs / 1000)).toFixed(1);

  console.log(`\n[${label}] 数据量: ${origMB.toFixed(2)} MB`);
  console.log(`  写入 (Deflate): 耗时 ${deflateMs.toFixed(2).padStart(6)} ms | 吞吐量 ${writeThroughput.padStart(6)} MB/s`);
  console.log(`  读取 (Inflate): 耗时 ${inflateMs.toFixed(2).padStart(6)} ms | 吞吐量 ${readThroughput.padStart(6)} MB/s`);
}

console.log("\n================ 2. 耗时与吞吐量评估 (均值) ================");
timeit("重度用户 (1500首总量)", SCENARIOS[3][1]);
timeit("骨灰用户 (6000首总量)", SCENARIOS[4][1]);
timeit("极限边缘 (35000首总量)", SCENARIOS[5][1]);