import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { publicUrlForKey, toPublicAssetUrl } from '../storage/asset-url.util';
import { StorageService } from '../storage/storage.interface';

const MAX_CONTENT_FILE_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext]),
);

export type SavedContentFile = {
  url: string;
  filename: string;
};

export async function saveContentFile(
  storage: StorageService,
  userId: string,
  file: { buffer: Buffer; mimetype: string; size?: number; originalname?: string },
): Promise<SavedContentFile> {
  if (!file.buffer?.length) {
    throw new BadRequestException('No file uploaded');
  }
  if (file.size != null && file.size > MAX_CONTENT_FILE_BYTES) {
    throw new BadRequestException('File must be 50 MB or smaller');
  }

  const { mimeType, ext } = resolveContentFileType(file.mimetype, file.originalname ?? '');
  const displayName = sanitizeDisplayFilename(file.originalname ?? `file${ext}`);
  const storageName = `${Date.now()}-${randomUUID()}${ext}`;
  const key = `content/files/${userId}/${storageName}`;
  const url = await storage.upload({
    buffer: file.buffer,
    key,
    mimeType,
  });

  return {
    url: toPublicAssetUrl(url) ?? publicUrlForKey(key),
    filename: displayName,
  };
}

function resolveContentFileType(mimetype: string, originalname: string): { mimeType: string; ext: string } {
  const normalizedMime = mimetype.trim().toLowerCase();
  const extFromMime = EXT_BY_MIME[normalizedMime];
  if (extFromMime) {
    return { mimeType: normalizedMime, ext: extFromMime };
  }

  const ext = extname(originalname).toLowerCase();
  const mimeFromExt = MIME_BY_EXT[ext];
  if (mimeFromExt) {
    return { mimeType: mimeFromExt, ext };
  }

  throw new BadRequestException(
    'Invalid file type. Allowed: PDF, Word, TXT, Excel, PowerPoint.',
  );
}

function sanitizeDisplayFilename(originalname: string): string {
  const base = originalname.split(/[/\\]/).pop()?.trim() ?? 'file';
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const safeStem = stem.replace(/[^\w\s.-]/g, '').trim().slice(0, 120) || 'file';
  return `${safeStem}${ext.toLowerCase()}`;
}
