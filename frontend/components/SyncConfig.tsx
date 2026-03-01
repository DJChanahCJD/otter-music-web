"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useSyncStore } from "@/stores/sync-store";
import { Button } from "./ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Dialog,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { checkAndSync } from "@/lib/sync";

export interface SyncConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncConfig({ open, onOpenChange }: SyncConfigProps) {
  const { syncKey, setSyncKey, clearSyncKey } = useSyncStore();
  const [inputKey, setInputKey] = useState("");

  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  };

  const handleConfirm = () => {
    if (!confirm("确认覆盖当前配置？")) return;
    if (inputKey.trim()) {
      setSyncKey(inputKey.trim());
      setInputKey("");
      onOpenChange(false);
    }
  };

  const handleClear = () => {
    if (!confirm("确认清除当前配置吗？")) return;
    clearSyncKey();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>配置同步密钥</DialogTitle>
          <DialogDescription>
            {syncKey
              ? `当前密钥: ${maskKey(syncKey)}`
              : "请输入您的 SYNC_KEY 用于数据同步"}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            type="password"
            placeholder="请输入 SYNC_KEY"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          />
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {syncKey && (
            <Button
              variant="outline"
              onClick={handleClear}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              清除密钥
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!inputKey.trim()}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
