import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { FORM_FILE_MAX_BYTES, isAllowedFormFile, type FormFileRef } from '@upstart/back-office/shared';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { sanitizeFileSegment } from '../storage/storage-keys.util';
import { fileRefsIn } from './form-fields.util';

/** What multer hands us (memory storage). */
export type UploadedFormFile = { buffer: Buffer; mimetype: string; originalname: string; size: number };

/** Staff uploads go here; public links get their own folder so a link's answers can only use its own files. */
export const formFilesPrefix = (formId: string) => `forms/${formId}/`;
export const linkFilesPrefix = (formId: string, linkId: string) => `forms/${formId}/links/${linkId}/`;

/**
 * Form file uploads (FILE fields). Files live privately under forms/{formId}/ (never served by /api/uploads);
 * they are read back only through signed-in downloads that check the person may see the answer they belong to.
 */
@Injectable()
export class FormFilesService {
  private readonly logger = new Logger(FormFilesService.name);

  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  /** Check and store one file under `prefix`; returns the reference the answer keeps. */
  async store(prefix: string, file: UploadedFormFile | undefined): Promise<FormFileRef> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file');
    const name = (file.originalname || 'file').slice(0, 255);
    if (file.size > FORM_FILE_MAX_BYTES) throw new BadRequestException('Files can be 10 MB at most');
    if (!isAllowedFormFile(name, file.mimetype)) throw new BadRequestException('Upload a Word, PDF, Excel, PNG or JPG file');
    const key = `${prefix}${randomUUID()}-${sanitizeFileSegment(name).slice(0, 120)}`;
    await this.storage.upload({
      buffer: file.buffer,
      key,
      mimeType: file.mimetype || undefined,
      originalFilename: name,
    });
    return { key, name, size: file.size, type: file.mimetype || '' };
  }

  /** Send a file that belongs to `values` (an answer set). 404 when the key isn't one of its files. */
  async send(res: Response, values: unknown, key: string | undefined, download = false) {
    const ref = key ? fileRefsIn(values).find((f) => f.key === key) : undefined;
    if (!ref || !(await this.storage.exists(ref.key))) throw new NotFoundException('File not found');
    const buffer = await this.storage.read(ref.key);
    const inline = !download && (ref.type === 'application/pdf' || ref.type.startsWith('image/'));
    res.setHeader('Content-Type', ref.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(ref.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }

  /** Delete the files an answer set refers to (answer deleted). Best effort. */
  async deleteIn(values: unknown) {
    for (const f of fileRefsIn(values)) {
      try {
        await this.storage.delete(f.key);
      } catch (err) {
        this.logger.warn(`Could not delete ${f.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** Delete every file of a form (form deleted). Best effort. */
  async deleteForm(formId: string) {
    try {
      await this.storage.deletePrefix(formFilesPrefix(formId));
    } catch (err) {
      this.logger.warn(`Could not delete files of form ${formId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
