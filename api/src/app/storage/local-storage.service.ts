import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from './storage.interface';

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
const URL_PREFIX = '/api/uploads/';

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
    return URL_PREFIX + key.replace(/\\/g, '/');
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
    return URL_PREFIX + destKey.replace(/\\/g, '/');
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

  keyFromUrl(url: string): string {
    return url.replace(/^\/api\/uploads\//, '').replace(/\\/g, '/');
  }
}
