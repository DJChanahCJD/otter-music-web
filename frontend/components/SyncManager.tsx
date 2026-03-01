"use client";

import { useEffect } from "react";
import { checkAndSync } from "@/lib/sync";

export function SyncManager() {
  useEffect(() => {

    // 立即执行一次检查（checkAndSync 内部会判断时间间隔）
    checkAndSync();

  }, []);

  return null;
}
