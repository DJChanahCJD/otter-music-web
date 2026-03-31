"use client";

import { useMusicStore } from "@/stores/music-store";
import { useShallow } from "zustand/react/shallow";
import { MusicTrack, Playlist } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, RotateCcw, Music2, ListMusic, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sourceLabels, sourceBadgeStyles } from "@/lib/types";

export function TrashView() {
  const { favorites, playlists, restoreFromTrash } = useMusicStore(
    useShallow((s) => ({
      favorites: s.favorites,
      playlists: s.playlists,
      restoreFromTrash: s.restoreFromTrash,
    }))
  );

  const deletedFavorites = favorites.filter((t) => t.is_deleted);
  const deletedPlaylists = playlists.filter((p) => p.is_deleted);
  const totalCount = deletedFavorites.length + deletedPlaylists.length;

  const handleRestore = (type: "favorite" | "playlist", id: string, name: string) => {
    restoreFromTrash(type, id);
    toast.success(`已恢复「${name}」`);
  };

  if (totalCount === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground select-none">
        <PackageOpen className="w-16 h-16 opacity-30" />
        <p className="text-sm">回收站是空的</p>
        <p className="text-xs opacity-60">删除的收藏和歌单将在此保留 7 天后自动清除</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-border/40 shrink-0">
        <Trash2 className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">回收站</h2>
        <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-6">
          {/* 已删除收藏 */}
          {deletedFavorites.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-2">
                <Music2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">已删除的收藏</span>
                <Badge variant="outline" className="text-xs">{deletedFavorites.length}</Badge>
              </div>
              <div className="space-y-1">
                {deletedFavorites.map((track) => (
                  <TrashTrackItem
                    key={track.id}
                    track={track}
                    onRestore={() => handleRestore("favorite", track.id, track.name)}
                  />
                ))}
              </div>
            </section>
          )}

          {deletedFavorites.length > 0 && deletedPlaylists.length > 0 && <Separator />}

          {/* 已删除歌单 */}
          {deletedPlaylists.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-2">
                <ListMusic className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">已删除的歌单</span>
                <Badge variant="outline" className="text-xs">{deletedPlaylists.length}</Badge>
              </div>
              <div className="space-y-1">
                {deletedPlaylists.map((playlist) => (
                  <TrashPlaylistItem
                    key={playlist.id}
                    playlist={playlist}
                    onRestore={() => handleRestore("playlist", playlist.id, playlist.name)}
                  />
                ))}
              </div>
            </section>
          )}

          <p className="text-center text-xs text-muted-foreground/50 pt-2 pb-4">
            回收站中的项目将在 7 天后自动清除
          </p>
        </div>
      </ScrollArea>
    </div>
  );
}

/* ---------- 子组件：回收站曲目行 ---------- */

function TrashTrackItem({
  track,
  onRestore,
}: {
  track: MusicTrack;
  onRestore: () => void;
}) {
  const sourceLabel = sourceLabels[track.source] ?? track.source;
  const badgeStyle = sourceBadgeStyles[track.source] ?? "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40 group transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate text-muted-foreground/80">{track.name}</span>
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium", badgeStyle)}>
            {sourceLabel}
          </span>
        </div>
        <span className="text-xs text-muted-foreground/50 truncate block">
          {track.artist.join(" / ")}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-primary hover:bg-primary/10 shrink-0"
        title="恢复"
        onClick={onRestore}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ---------- 子组件：回收站歌单行 ---------- */

function TrashPlaylistItem({
  playlist,
  onRestore,
}: {
  playlist: Playlist;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/40 group transition-colors">
      <ListMusic className="w-4 h-4 text-muted-foreground/50 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate text-muted-foreground/80 block">{playlist.name}</span>
        <span className="text-xs text-muted-foreground/50">{playlist.tracks.length} 首歌曲</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        title="恢复"
        onClick={onRestore}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
