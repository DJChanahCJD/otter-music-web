import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../types/hono';
import { SearchPodcastItem } from '@shared/types';

export const searchRoutes = new Hono<{
  Bindings: Env;
}>();

const querySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  country: z.string().trim().length(2).optional().default('CN'),
  lang: z.string().trim().optional().default('zh_cn'),
});

type ApplePodcastResult = {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  collectionViewUrl?: string;
  genres?: string[];
};


function normalizeAppleResult(item: ApplePodcastResult): SearchPodcastItem {
  return {
    source: 'apple',
    id: String(item.collectionId ?? ''),
    title: item.collectionName?.trim() ?? '',
    author: item.artistName?.trim() ?? '',
    cover: item.artworkUrl600?.trim() || item.artworkUrl100?.trim() || null,
    rssUrl: item.feedUrl?.trim() || null,
    url: item.collectionViewUrl?.trim() || null,
    // intro: '',
    // genres: item.genres ?? [],
  };
}

async function searchApplePodcasts(params: {
  q: string;
  limit: number;
  country: string;
  lang: string;
}): Promise<SearchPodcastItem[]> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', params.q);
  url.searchParams.set('media', 'podcast');
  url.searchParams.set('entity', 'podcast');
  url.searchParams.set('limit', String(params.limit));
  url.searchParams.set('country', params.country.toUpperCase() || 'CN');
  url.searchParams.set('lang', params.lang.toLowerCase() || 'zh_cn');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'OtterMusic/2.0',
    },
    cf: {
      cacheTtl: 60 * 60,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`Apple search failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    results?: ApplePodcastResult[];
  };

  return (json.results ?? [])
    .map(normalizeAppleResult)
    .filter((item) => item.id && item.title);
}

searchRoutes.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Invalid query parameters',
      },
      400
    );
  }

  const { q, limit, country, lang } = parsed.data;

  try {
    const data = await searchApplePodcasts({
      q,
      limit,
      country,
      lang,
    });

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Podcast search failed',
      },
      500
    );
  }
});