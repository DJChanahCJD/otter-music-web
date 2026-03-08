// === Music Store Types ===

// 音乐轨道信息
export type MusicSource =
  | 'netease' //  🌟
  | '_netease'  //  网易云客户端 API 的音乐源
  | 'tencent'
  | 'kugou'
  | 'kuwo' //  🌟
  | 'bilibili'
  | 'migu'
  | 'qq'
  | 'fivesing'
  | 'tk'
  | 'wy'
  | 'kg'
  | 'kw'
  | 'mg'
  | 'qi'
  | 'lizhi'
  | 'qingting'
  | 'ximalaya'
  // Common sources mentioned in doc: netease, tencent, tidal, spotify, ytmusic, qobuz, joox, deezer, migu, kugou, kuwo, ximalaya, apple
  | 'tidal' | 'spotify' | 'ytmusic' | 'qobuz' | 'joox' | 'deezer' | 'apple' | 'all' | 'podcast';

export interface MusicTrack {
  id: string;
  name: string;
  artist: string[];
  album: string;
  pic_id: string;
  url_id: string;
  lyric_id: string;
  source: MusicSource;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: MusicTrack[];
  createdAt: number;
}

// 需要持久化存储的音乐数据结构
export interface MusicStoreData {
  favorites: MusicTrack[];
  playlists: Playlist[];
  queue: MusicTrack[];
  originalQueue?: MusicTrack[];
  currentIndex: number;
  volume: number;
  isRepeat: boolean;
  isShuffle: boolean;
  quality: string;
  searchSource: MusicSource;
  updatedAt?: number;
}
