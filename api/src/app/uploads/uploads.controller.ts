import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Response } from 'express';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

@Controller('uploads')
export class UploadsController {
  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  /**
   * Public file serving (no auth — used by &lt;img src&gt; which cannot send Bearer tokens).
   * Streams from local disk or S3 depending on STORAGE_PROVIDER.
   */
  @Get('*path')
  async serve(@Param('path') path: string | string[], @Res() res: Response) {
    const segments = Array.isArray(path) ? path : [path];
    const key = segments.join('/');
    if (!key || key.includes('..')) {
      throw new NotFoundException();
    }

    const exists = await this.storage.exists(key);
    if (!exists) {
      throw new NotFoundException();
    }

    const buffer = await this.storage.read(key);
    const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
    res.setHeader('Content-Type', MIME_BY_EXT[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  }
}
