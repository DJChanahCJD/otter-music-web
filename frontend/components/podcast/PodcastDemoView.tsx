"use client";

import { useState, useRef, useEffect } from "react";
import { PodcastFeed, PodcastEpisode, MusicTrack, SearchPodcastItem } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Search, 
  Play, 
  Podcast, 
  AlertCircle,
  Rss
} from "lucide-react";
import { fetchRssFeed, searchPodcasts } from "@/lib/api/podcast";
import { useMusicStore } from "@/stores/music-store";
import { podcastEpisodeToTrack } from "@/lib/adapter/podcast";
import { cn } from "@/lib/utils";

// --- Components ---

function PodcastCard({ 
  item, 
  isSelected, 
  onClick 
}: { 
  item: SearchPodcastItem; 
  isSelected: boolean; 
  onClick: () => void; 
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-all duration-200 group",
        "hover:bg-accent/50",
        isSelected ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0 border border-border/50">
          {item.cover ? (
            <img 
              src={item.cover} 
              alt={item.title} 
              className="w-full h-full object-cover" 
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/50">
              <Podcast className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className={cn("font-medium text-sm truncate leading-none pt-1", isSelected ? "text-foreground" : "text-foreground/80")}>
            {item.title}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {item.author || "Unknown Author"}
          </div>
        </div>
      </div>
    </button>
  );
}

function EpisodeItem({ episode, onPlay }: { episode: PodcastEpisode; index: number; onPlay: () => void }) {
  const dateStr = episode.pubDate 
    ? new Date(episode.pubDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) 
    : "";
  const desc = (episode.desc || episode.title).replace(/<[^>]*>?/gm, '').slice(0, 120);

  return (
    <div className="group flex items-start gap-4 p-4 rounded-xl hover:bg-accent/30 transition-colors border border-transparent hover:border-border/50">
      <Button size="icon" variant="secondary" className="h-10 w-10 shrink-0 rounded-full shadow-sm hover:bg-primary hover:text-primary-foreground" onClick={onPlay}>
        <Play className="h-4 w-4 ml-0.5" />
      </Button>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex justify-between items-center gap-2">
          <h4 className="font-medium text-foreground line-clamp-2 group-hover:text-primary">{episode.title}</h4>
          {dateStr && <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full shrink-0">{dateStr}</span>}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{desc}...</p>
      </div>
    </div>
  );
}

// --- Main View ---

export function PodcastDemoView() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ searching: false, feeding: false, error: "" });
  const [results, setResults] = useState<SearchPodcastItem[]>([]);
  const [selected, setSelected] = useState<SearchPodcastItem | null>(null);
  const [feed, setFeed] = useState<PodcastFeed | null>(null);
  
  const playContext = useMusicStore((s) => s.playContext);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setState({ searching: true, feeding: false, error: "" });
    setFeed(null); setSelected(null);
    try {
      const data = await searchPodcasts({ q: query.trim(), limit: 10 });
      setResults(data);
      if (!data.length) setState(s => ({ ...s, error: "未找到相关播客" }));
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "搜索失败" }));
    } finally {
      setState(s => ({ ...s, searching: false }));
    }
  };

  const handleSelect = async (item: SearchPodcastItem) => {
    if (!item.rssUrl) return setState(s => ({ ...s, error: "缺少 RSS 地址" }));
    setState({ searching: false, feeding: true, error: "" });
    setSelected(item); setFeed(null);
    try {
      setFeed(await fetchRssFeed({ id: item.id, name: item.title, rssUrl: item.rssUrl }));
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : "RSS 加载失败" }));
    } finally {
      setState(s => ({ ...s, feeding: false }));
    }
  };

  const playEpisode = (i: number) => feed && playContext(feed.episodes.map(ep => podcastEpisodeToTrack(ep, feed)), i);

  // --- Render Helpers ---
  const renderMainContent = () => {
    if (state.feeding) return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
        <p className="text-sm text-muted-foreground animate-pulse">正在解析 RSS...</p>
      </div>
    );

    if (feed) return (
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
        <div className="max-w-4xl mx-auto w-full">
          <div className="p-8 pb-6 flex flex-col md:flex-row gap-8 items-start border-b border-border/40 bg-linear-to-b from-muted/20 to-transparent">
            <div className="w-40 h-40 md:w-48 md:h-48 rounded-xl overflow-hidden shadow-xl shrink-0 bg-muted flex items-center justify-center">
              {feed.coverUrl ? <img src={feed.coverUrl} alt={feed.name} className="w-full h-full object-cover" /> : <Podcast className="h-12 w-12 text-muted-foreground" />}
            </div>
            <div className="flex-1 space-y-4 pt-2">
              <h2 className="text-3xl md:text-4xl font-bold">{feed.name}</h2>
              <p className="text-muted-foreground line-clamp-3 md:line-clamp-2" title={feed.description}>{feed.description || "暂无简介"}</p>
              <div className="flex gap-3 pt-2">
                <Button onClick={() => playEpisode(0)} className="rounded-full shadow-md"><Play className="h-4 w-4 mr-2 fill-current" /> 播放最新</Button>
                <Button variant="outline" className="rounded-full"><Rss className="h-4 w-4 mr-2" /> 订阅</Button>
              </div>
            </div>
          </div>
          <div className="p-6 md:p-8 space-y-4">
            <h3 className="text-lg font-semibold">节目列表 <span className="text-muted-foreground font-normal text-sm">({feed.episodes.length})</span></h3>
            <div className="grid gap-2">
              {feed.episodes.length ? feed.episodes.map((ep, i) => <EpisodeItem key={ep.id || i} episode={ep} index={i} onPlay={() => playEpisode(i)} />) : <p className="py-12 text-center text-muted-foreground">暂无节目</p>}
            </div>
          </div>
          </div>
        </ScrollArea>
      </div>
    );

    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 p-8 text-center animate-in fade-in">
        <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-2"><Podcast className="h-10 w-10 opacity-20" /></div>
        <h3 className="text-lg font-medium text-foreground">探索精彩播客</h3>
        <p className="text-sm">输入关键词搜索，发现你感兴趣的内容。支持 RSS 订阅源解析。</p>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="shrink-0 px-6 py-4 border-b border-border/40 bg-background/95 backdrop-blur z-10">
        <div className="max-w-2xl mx-auto relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="搜索播客 (例如: 故事FM)" className="pl-10 h-11 rounded-full bg-muted/20 border-muted-foreground/20 text-base" />
          {state.searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {(results.length > 0 || state.error) && (
          <div className="w-[320px] border-r border-border/40 flex flex-col bg-muted/5">
            <div className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase flex justify-between">
              <span>Results</span><span className="bg-muted px-1.5 py-0.5 rounded">{results.length}</span>
            </div>
            <div className="flex-1 min-h-0">
              <ScrollArea className="h-full px-3">
                <div className="space-y-1 pb-4">
                  {results.map(item => <PodcastCard key={item.id} item={item} isSelected={selected?.id === item.id} onClick={() => handleSelect(item)} />)}
                  {!state.searching && state.error && <div className="p-3 text-sm text-destructive flex items-center gap-2 bg-destructive/5 rounded-lg m-2"><AlertCircle className="h-4 w-4 shrink-0" />{state.error}</div>}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}