import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StoreKey } from '.';
import { checkAndSync } from '@/lib/sync';

interface SyncState {
  syncKey: string | null;
  lastSyncTime: number;

  setSyncKey: (key: string) => void;
  clearSyncKey: () => void;
  setLastSyncTime: (time: number) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      syncKey: null,
      lastSyncTime: 0,

      setSyncKey: (key) => {
        set({ syncKey: key })
        checkAndSync()
      },
      clearSyncKey: () => set({ syncKey: null }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
    }),
    {
      name: StoreKey.SyncKey,
      partialize: (state) => ({
        syncKey: state.syncKey,
        lastSyncTime: state.lastSyncTime,
      }),
    }
  )
);
