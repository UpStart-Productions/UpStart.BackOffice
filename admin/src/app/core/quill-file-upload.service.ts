import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import type Quill from 'quill';
import { ApiService } from './api.service';
import { resolveAssetUrl } from './asset-url.util';
import type { ContentFileBlotValue } from './quill-file.blot';

const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const ALLOWED_EXTENSIONS = '.pdf,.doc,.docx,.txt,.xlsx,.ppt,.pptx';
const MAX_FILE_BYTES = 50 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class QuillFileUploadService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  handleToolbarClick(quill: Quill): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ALLOWED_EXTENSIONS;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.uploadAndInsert(quill, file);
    };
    input.click();
  }

  private async uploadAndInsert(quill: Quill, file: File): Promise<void> {
    if (!this.isAllowedFile(file)) {
      this.toast.add({
        severity: 'error',
        summary: 'Invalid file',
        detail: 'Allowed types: PDF, Word, TXT, Excel, PowerPoint.',
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.toast.add({
        severity: 'error',
        summary: 'File too large',
        detail: 'Files must be 50 MB or smaller.',
      });
      return;
    }

    const range = quill.getSelection(true);
    const index = range?.index ?? Math.max(0, quill.getLength() - 1);

    try {
      const res = await this.api.uploadFile<{ url: string; filename: string }>(
        '/uploads/content-file',
        file,
      );
      const displayUrl = resolveAssetUrl(res.url) ?? res.url;
      const embed: ContentFileBlotValue = {
        url: displayUrl,
        name: res.filename?.trim() || file.name,
      };
      quill.insertEmbed(index, 'contentFile', embed, 'user');
      quill.insertText(index + 1, ' ', 'user');
      quill.setSelection(index + 2, 0, 'silent');
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Upload failed',
        detail: err instanceof Error ? err.message : 'Could not upload file',
      });
    }
  }

  private isAllowedFile(file: File): boolean {
    if (ALLOWED_FILE_TYPES.has(file.type)) return true;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    return ['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.ppt', '.pptx'].includes(ext);
  }
}
