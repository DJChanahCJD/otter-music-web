import { MusicTrack, PodcastEpisode, PodcastFeed } from "@shared/types";

export function podcastEpisodeToTrack(
  episode: PodcastEpisode,
  podcast: PodcastFeed
): MusicTrack {
  return {
    id: episode.id,
    name: episode.title,
    artist: [podcast.name],
    album: podcast.name,
    // 对于 podcast 源，我们在 musicApi 中约定：
    // url_id 直接存储 audioUrl
    // pic_id 直接存储 coverUrl
    url_id: episode.audioUrl || "",
    pic_id: episode.coverUrl || podcast.coverUrl || "",
    lyric_id: "",
    source: "podcast",
  };
}
