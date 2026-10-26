import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ImageResizeService } from '../storage/image-resize.service';
import { publicUrlForKey, toPublicAssetUrl } from '../storage/asset-url.util';
import { StorageService } from '../storage/storage.interface';

const ALLOWED_CONTENT_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

const MAX_CONTENT_IMAGE_BYTES = 5 * 1024 * 1024;

export async function saveContentImage(
  imageResize: ImageResizeService,
  storage: StorageService,
  userId: string,
  file: { buffer: Buffer; mimetype: string; size?: number },
): Promise<string> {
  if (!file.buffer?.length) {
    throw new BadRequestException('No file uploaded');
  }
  if (file.size != null && file.size > MAX_CONTENT_IMAGE_BYTES) {
    throw new BadRequestException('Image must be 5 MB or smaller');
  }
  if (!ALLOWED_CONTENT_IMAGE_MIMES.includes(file.mimetype)) {
    throw new BadRequestException('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
  }

  const processed = await imageResize.process(file.buffer, file.mimetype, 'content');
  const filename = `${Date.now()}-${randomUUID()}${processed.ext}`;
  const key = `content/images/${userId}/${filename}`;
  const url = await storage.upload({
    buffer: processed.buffer,
    key,
    mimeType: processed.mimeType,
  });

  return toPublicAssetUrl(url) ?? publicUrlForKey(key);
}
