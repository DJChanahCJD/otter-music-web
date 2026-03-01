
export interface KVNamespace {
  get(key: string, options?: any): Promise<any>;
  put(key: string, value: any, options?: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: any): Promise<any>;
  getWithMetadata<T = unknown>(key: string): Promise<{ value: any; metadata: T }>;
}

export type Env = {
  oh_file_url: KVNamespace;
  PASSWORD?: string;
};
