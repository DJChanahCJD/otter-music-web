import { PodcastRssSource, PodcastFeed, SearchPodcastItem } from "@shared/types";
import { API_URL } from "./config";

interface SearchPodcastParams {
  q: string;
  limit?: number;
  country?: string;
  lang?: string;
}

export async function fetchRssFeed(source: PodcastRssSource) {
  const res = await fetch(`${API_URL}/podcast-api/rss?url=${encodeURIComponent(source.rssUrl)}`);
  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error || "Failed to load RSS");
  }

  return json.data as PodcastFeed;
}

export async function searchPodcasts({
  q,
  limit = 20,
  country = "CN",
  lang = "zh_cn",
}: SearchPodcastParams): Promise<SearchPodcastItem[]> {
  const query = new URLSearchParams({
    q,
    limit: String(limit),
    country,
    lang,
  });
  const res = await fetch(`${API_URL}/podcast-api/search?${query.toString()}`);
  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error || "Failed to search podcasts");
  }

  return (json.data || []) as SearchPodcastItem[];
}
