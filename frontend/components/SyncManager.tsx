"use client";

import { useEffect } from "react";
import { checkAndSync } from "@/lib/sync";

export function SyncManager() {
  useEffect(() => {
    checkAndSync();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAndSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
