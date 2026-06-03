import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ImageResizePreset = 'content' | 'avatar' | 'logo';

const PRESET_MAX_DIMENSION: Record<ImageResizePreset, number> = {
  content: 1080,
  avatar: 256,
  logo: 512,
};

const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  ext: string;
}

@Injectable()
export class ImageResizeService {
  async process(
    buffer: Buffer,
    mimeType: string,
    preset: ImageResizePreset,
  ): Promise<ProcessedImage> {
    if (!IMAGE_MIMES.has(mimeType)) {
      return {
        buffer,
        mimeType,
        ext: this.extFromMime(mimeType),
      };
    }

    try {
      const maxDim = PRESET_MAX_DIMENSION[preset];
      const instance = sharp(buffer);
      const metadata = await instance.metadata();
      const hasAlpha = metadata.hasAlpha === true;

      const pipeline = instance.resize(maxDim, maxDim, {
        fit: 'inside',
        withoutEnlargement: true,
      });

      if (hasAlpha) {
        const out = await pipeline.png({ compressionLevel: 6 }).toBuffer();
        return {
          buffer: out,
          mimeType: 'image/png',
          ext: '.png',
        };
      }

      const out = await pipeline.jpeg({ quality: 80, progressive: true }).toBuffer();
      return {
        buffer: out,
        mimeType: 'image/jpeg',
        ext: '.jpg',
      };
    } catch {
      return {
        buffer,
        mimeType,
        ext: this.extFromMime(mimeType),
      };
    }
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return map[mime] ?? '.png';
  }
}
