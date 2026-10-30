import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Request, Response } from 'express';
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
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

@Controller('uploads')
export class UploadsController {
  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  /**
   * Public file serving (no auth — used by &lt;img src&gt; which cannot send Bearer tokens).
   * Streams from local disk or S3 depending on STORAGE_PROVIDER.
   */
  @Get('*path')
  async serve(@Param('path') path: string | string[], @Req() req: Request, @Res() res: Response) {
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
    res.setHeader('Accept-Ranges', 'bytes');

    // Byte ranges: video players (Safari always) ask for parts of the file to start and seek.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const size = buffer.length;
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (start > end || start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.end(buffer.subarray(start, end + 1));
      return;
    }
    res.send(buffer);
  }
}
