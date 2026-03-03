import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { neteaseApi } from '@/lib/api/netease';
import { RECOMMEND_FILTERS, ALL_FILTERS } from './constants';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const PAGE_SIZE = 30;

export function NetEaseDiscoverTab({ cookie, onPlaylistClick }: { cookie: string, onPlaylistClick: (p: any) => void }) {
  const [selectedCategory, setSelectedCategory] = useState({ id: '', name: '全部' });
  const [toplists, setToplists] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadInitialData();
    });
  }, [cookie, selectedCategory.id]);

  const loadInitialData = async () => {
    setLoading(true);
    setPlaylists([]);
    setToplists([]);
    setOffset(0);
    setHasMore(true);
    
    try {
      if (selectedCategory.id === 'toplist') {
        const topRes = await neteaseApi.getToplist(cookie).catch(() => null);
        if (topRes && topRes.data && topRes.data.code === 200) {
          setToplists(topRes.data.list);
          setHasMore(false);
        }
      } else {
        const plRes = await neteaseApi.getPlaylists(selectedCategory.id || '全部', undefined, PAGE_SIZE, 0, cookie).catch(() => null);
        if (plRes && plRes.data && plRes.data.code === 200) {
          setPlaylists(plRes.data.playlists);
          setOffset(PAGE_SIZE);
          setHasMore(plRes.data.more ?? (plRes.data.playlists.length >= PAGE_SIZE));
        }
      }
    } catch (e) {
      toast.error('Failed to load discovery data');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || selectedCategory.id === 'toplist') return;

    setLoadingMore(true);
    try {
      const plRes = await neteaseApi.getPlaylists(selectedCategory.id || '全部', undefined, PAGE_SIZE, offset, cookie).catch(() => null);
      if (plRes && plRes.data && plRes.data.code === 200) {
        const newPlaylists = plRes.data.playlists;
        if (newPlaylists && newPlaylists.length > 0) {
          setPlaylists(prev => [...prev, ...newPlaylists]);
          setOffset(prev => prev + newPlaylists.length);
          setHasMore(plRes.data.more ?? (newPlaylists.length >= PAGE_SIZE));
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false); // Error or invalid response, stop loading
      }
    } catch (e) {
      toast.error('Failed to load more playlists');
      setHasMore(false); // Stop trying on error to avoid loop
    } finally {
      setLoadingMore(false);
    }
  }, [cookie, hasMore, loading, loadingMore, offset, selectedCategory.id]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void loadMore();
        }
      },
      {
        root: viewportRef.current,
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [loadMore]);

  const handleCategorySelect = (filter: { id: string, name: string }) => {
    if (selectedCategory.id === filter.id) return;
    setSelectedCategory(filter);
    setIsOpen(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Category Filter Bar */}
      <div className="flex items-center px-4 py-2 border-b gap-2 flex-shrink-0 bg-background/95 backdrop-blur z-10">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max space-x-2 pb-2 pt-2">
            {RECOMMEND_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                variant={selectedCategory.name === filter.name ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 px-3 text-xs rounded-full ${selectedCategory.name === filter.name ? "font-bold bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
                onClick={() => handleCategorySelect(filter)}
              >
                {filter.name}
              </Button>
            ))}
            
            <Popover open={isOpen} onOpenChange={setIsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-3 text-xs rounded-full text-muted-foreground flex items-center gap-1">
                  更多 <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[600px] p-4" align="start">
                <div className="grid gap-4 max-h-[400px] overflow-y-auto pr-2">
                  {ALL_FILTERS.map((group) => (
                    <div key={group.category} className="space-y-2">
                      <h4 className="font-medium text-sm text-muted-foreground">{group.category}</h4>
                      <div className="flex flex-wrap gap-2">
                        {group.filters.map((filter) => (
                          <Button
                            key={filter.id}
                            variant={selectedCategory.name === filter.name ? "secondary" : "outline"}
                            size="sm"
                            className={`h-7 text-xs ${selectedCategory.name === filter.name ? "bg-secondary" : "hover:bg-accent"}`}
                            onClick={() => handleCategorySelect(filter)}
                          >
                            {filter.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full" viewportRef={viewportRef}>
          <div className="p-4 min-h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Toplists View */}
                {selectedCategory.id === 'toplist' && toplists.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {toplists.map((item) => (
                      <div key={item.id} className="cursor-pointer group space-y-2" onClick={() => onPlaylistClick(item)}>
                        <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                          <img src={item.coverImgUrl} alt={item.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                          <div className="absolute bottom-1 right-2 text-[10px] text-white/90 drop-shadow-md bg-black/30 px-1.5 py-0.5 rounded-sm backdrop-blur-sm">
                             {item.updateFrequency}
                          </div>
                        </div>
                        <p className="text-sm font-medium line-clamp-2 leading-tight group-hover:text-primary transition-colors">{item.name}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Playlists View */}
                {selectedCategory.id !== 'toplist' && playlists.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {playlists.map((item) => (
                      <div key={item.id} className="cursor-pointer group space-y-2" onClick={() => onPlaylistClick(item)}>
                        <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                          <img src={item.coverImgUrl} alt={item.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                          <div className="absolute top-1 right-2 text-[10px] text-white/90 drop-shadow-md bg-black/30 px-1.5 py-0.5 rounded-sm backdrop-blur-sm flex items-center gap-1">
                             <span className="text-[8px]">▶</span> {formatPlayCount(item.playCount)}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                            <div className="text-[10px] text-white/90 truncate">
                               {item.creator?.nickname}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-medium line-clamp-2 leading-tight group-hover:text-primary transition-colors">{item.name}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!loading && playlists.length === 0 && toplists.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                     <p>暂无内容</p>
                  </div>
                )}

                {/* Load More Sentinel & Indicator */}
                {selectedCategory.id !== 'toplist' && (playlists.length > 0 || loadingMore) && (
                  <div ref={loadMoreRef} className="py-6 flex justify-center w-full">
                    {loadingMore ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      !hasMore && playlists.length > 0 && (
                        <p className="text-xs text-muted-foreground">没有更多了</p>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function formatPlayCount(count: number) {
  if (count > 100000000) return (count / 100000000).toFixed(1) + '亿';
  if (count > 10000) return (count / 10000).toFixed(1) + '万';
  return count;
}
