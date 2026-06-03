import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { publicUrlForKey } from './asset-url.util';
import { StorageService } from './storage.interface';

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');

@Injectable()
export class LocalStorageService implements StorageService {
  async upload({
    buffer,
    key,
  }: {
    buffer: Buffer;
    key: string;
    mimeType?: string;
  }): Promise<string> {
    const fullPath = path.join(UPLOADS_ROOT, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    return publicUrlForKey(key);
  }

  async copy({
    sourceKey,
    destKey,
  }: {
    sourceKey: string;
    destKey: string;
  }): Promise<string> {
    const src = path.join(UPLOADS_ROOT, sourceKey);
    const dest = path.join(UPLOADS_ROOT, destKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return publicUrlForKey(destKey);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(UPLOADS_ROOT, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(path.join(UPLOADS_ROOT, key));
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFileSync(path.join(UPLOADS_ROOT, key));
  }

  async deletePrefix(prefix: string): Promise<void> {
    const dir = path.join(UPLOADS_ROOT, prefix.replace(/\/$/, ''));
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  keyFromUrl(url: string): string {
    if (url.startsWith('/api/uploads/')) return url.replace(/^\/api\/uploads\//, '').replace(/\\/g, '/');
    if (url.includes('.amazonaws.com/')) {
      try {
        return new URL(url).pathname.replace(/^\//, '');
      } catch {
        /* fall through */
      }
    }
    return url.replace(/\\/g, '/');
  }
}
