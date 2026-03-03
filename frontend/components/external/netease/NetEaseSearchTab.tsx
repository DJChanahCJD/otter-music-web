import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { neteaseApi } from '@/lib/api/netease';
import { MusicTrackList } from '../../MusicTrackList';
import { MusicTrack } from '@shared/types';

export function NetEaseSearchTab({
  cookie,
  onPlayContext,
  currentTrackId,
  isPlaying,
}: {
  cookie: string;
  onPlayContext: (tracks: MusicTrack[], startIndex?: number) => void;
  currentTrackId?: string;
  isPlaying?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [isFirstLoading, setIsFirstLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);

  const fetchPage = async (nextPage: number, reset = false) => {
    if (!query.trim()) return;
    if (loading && !reset) return;

    const version = ++versionRef.current;

    if (reset) {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setResults([]);
      setPage(0);
      setIsFirstLoading(true);
    }

    setLoading(true);

    try {
      const res = await neteaseApi.searchTracks(
        query,
        nextPage,
        20,
        cookie,
        abortRef.current?.signal
      );

      if (version !== versionRef.current) return;

      setResults((prev) => (reset ? res.items : [...prev, ...res.items]));
      setHasMore(res.hasMore);
      setPage(nextPage);
    } catch (e: any) {
      if (e?.name !== "AbortError" && version === versionRef.current) {
        toast.error("搜索失败，请重试");
      }
    } finally {
      if (version === versionRef.current) {
        setLoading(false);
        setIsFirstLoading(false);
      }
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setPage(0);
    setHasMore(false);
    abortRef.current?.abort();
    setLoading(false);
    setIsFirstLoading(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPage(1, true)}
              placeholder="搜索歌曲 / 歌手 / 专辑"
              className="pl-9 pr-9"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <Button onClick={() => fetchPage(1, true)} disabled={loading && isFirstLoading}>
            {loading && isFirstLoading ? <Loader2 className="animate-spin" /> : <Search />}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {isFirstLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MusicTrackList
            tracks={results}
            onPlay={(track) => {
              const index = results.findIndex((t) => t.id === track.id);
              onPlayContext(results, Math.max(0, index));
            }}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            loading={loading}
            hasMore={hasMore}
            onLoadMore={() => fetchPage(page + 1)}
            emptyMessage={
              <div className="flex flex-col items-center gap-1">
                <p>{loading ? "加载中..." : "输入关键词开始搜索"}</p>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
