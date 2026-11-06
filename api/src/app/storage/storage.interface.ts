export const STORAGE_SERVICE = Symbol('StorageService');

export interface StorageService {
  upload(params: {
    buffer: Buffer;
    key: string;
    mimeType?: string;
    /** Original upload name; used for Content-Disposition on GET /api/uploads/…. */
    originalFilename?: string;
  }): Promise<string>;

  copy(params: { sourceKey: string; destKey: string }): Promise<string>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  read(key: string): Promise<Buffer>;

  /** Stored original filename from upload time, if any. */
  originalFilename(key: string): Promise<string | null>;

  /** Extract storage key from a URL previously returned by upload/copy. */
  keyFromUrl(url: string): string;

  /** Delete all objects under a prefix (e.g. `clients/{id}/`). */
  deletePrefix(prefix: string): Promise<void>;
}
