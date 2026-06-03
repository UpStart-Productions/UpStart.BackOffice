export const STORAGE_SERVICE = Symbol('StorageService');

export interface StorageService {
  upload(params: {
    buffer: Buffer;
    key: string;
    mimeType?: string;
  }): Promise<string>;

  copy(params: { sourceKey: string; destKey: string }): Promise<string>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  read(key: string): Promise<Buffer>;

  /** Extract storage key from a URL previously returned by upload/copy. */
  keyFromUrl(url: string): string;
}
