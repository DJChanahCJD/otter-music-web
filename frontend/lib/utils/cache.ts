// lib/utils/client-cache.ts（仅客户端使用）
const CACHE_NAME = 'otter-music-cache-v1';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; 

const inflightRequests = new Map<string, Promise<any>>();

function getInflightRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing;
  }

  const promise = fetcher().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

export async function clientSWRFetch<T>(
  key: string,
  fetcher: () => Promise<T | null>,
  ttl: number = DEFAULT_TTL
): Promise<T | null> {
  // 非浏览器环境直接调用fetcher
  if (typeof caches === 'undefined' || typeof window === 'undefined') {
    return fetcher();
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = new Request(`https://cache.local/music/${encodeURIComponent(key)}`);
    const cachedResponse = await cache.match(cacheKey);

    // 命中缓存
    if (cachedResponse) {
      const expiryTime = Number(cachedResponse.headers.get('x-expiry') || 0);
      const cachedData = await cachedResponse.json() as T;

      // 未过期，直接返回
      if (expiryTime > Date.now()) {
        return cachedData;
      }

      // 已过期，后台刷新缓存，先返回旧数据
      getInflightRequest(key, fetcher)
        .then(freshData => {
          if (freshData) {
            cache.put(
              cacheKey,
              new Response(JSON.stringify(freshData), {
                headers: {
                  'Content-Type': 'application/json',
                  'x-expiry': String(Date.now() + ttl),
                },
              })
            );
          }
        })
        .catch(err => console.error('Client cache refresh failed:', err));

      return cachedData;
    }

    // 未命中缓存，获取新数据并缓存
    const freshData = await getInflightRequest(key, fetcher);
    if (freshData) {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(freshData), {
          headers: {
            'Content-Type': 'application/json',
            'x-expiry': String(Date.now() + ttl),
          },
        })
      );
    }

    return freshData;
  } catch (error) {
    console.error('Client cache error:', error);
    // 缓存出错时降级为直接调用fetcher
    return fetcher();
  }
}