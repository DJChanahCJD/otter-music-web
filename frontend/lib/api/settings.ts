import { SyncKeyItem } from '@shared/types';
import { client } from './client';
import { unwrap } from './config';

export const syncKeyApi = {
  async check(): Promise<number> {
    const res = await unwrap<{ lastSyncTime: number }>(client.sync.check.$get());
    return res.lastSyncTime;
  },

  async list(): Promise<SyncKeyItem[]> {
    const res = await unwrap<{ keys: SyncKeyItem[] }>(client.sync.keys.$get());
    return res.keys;
  },

  async create(prefix?: string): Promise<string> {
    const res = await unwrap<{ syncKey: string }>(
      client.sync['create-key'].$post({
        json: { prefix },
      })
    );
    return res.syncKey;
  },

  async delete(key: string): Promise<void> {
    await unwrap<null>(client.sync.keys[':key'].$delete({ param: { key } }));
  },
};
