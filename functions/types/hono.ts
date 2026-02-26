
export interface KVNamespace {
  get(key: string, options?: any): Promise<any>;
  put(key: string, value: any, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: any): Promise<any>;
  getWithMetadata<T = unknown>(key: string): Promise<{ value: any; metadata: T }>;
}

// 可以自己拓展 R2Bucket, SQLite等
// KV和环境变量配置参考："dev:backend": "npx wrangler pages dev frontend/out --kv \"oh_file_url\" --r2 \"oh_file_r2\" --binding PASSWORD=123456 --binding API_TOKEN=123456 --ip 0.0.0.0 --port 8080 --persist-to ./data",

export type Env = {
  your_kv: KVNamespace;   // TODO: 替换为自己的KVNamespace， 或者删除
  PASSWORD?: string;
};
