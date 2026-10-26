import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import type Quill from 'quill';
import { ApiService } from './api.service';
import { resolveAssetUrl } from './asset-url.util';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class QuillImageUploadService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  handleToolbarClick(quill: Quill): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.uploadAndInsert(quill, file);
    };
    input.click();
  }

  private async uploadAndInsert(quill: Quill, file: File): Promise<void> {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      this.toast.add({
        severity: 'error',
        summary: 'Invalid image',
        detail: 'Allowed types: PNG, JPEG, GIF, WebP.',
      });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.toast.add({
        severity: 'error',
        summary: 'Image too large',
        detail: 'Images must be 5 MB or smaller.',
      });
      return;
    }

    const range = quill.getSelection(true);
    const index = range?.index ?? Math.max(0, quill.getLength() - 1);

    try {
      const res = await this.api.uploadFile<{ url: string }>('/uploads/content-image', file);
      const displayUrl = resolveAssetUrl(res.url) ?? res.url;
      quill.insertEmbed(index, 'image', displayUrl, 'user');
      quill.setSelection(index + 1, 0, 'silent');
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Upload failed',
        detail: err instanceof Error ? err.message : 'Could not upload image',
      });
    }
  }
}
