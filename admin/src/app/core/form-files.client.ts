import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';
import type { FormFileRef } from '@upstart/back-office/shared';
import type { FormFileOpener, FormFileUploader } from '../ui/form-builder/form-field-input.component';
import { ApiService } from './api.service';

/**
 * Staff side of form file uploads: upload to a form, and download a file through the signed-in endpoint of the
 * answer it belongs to (client form result, submission or visit). Pages pass the results to app-form-field-input.
 */
@Injectable({ providedIn: 'root' })
export class FormFilesClient {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  /** Uploader for a form's file questions. */
  uploader(formId: string): FormFileUploader {
    return (file: File) => this.api.uploadFile<FormFileRef>(`/form-files/forms/${encodeURIComponent(formId)}`, file);
  }

  /** Opener that downloads from `{base}?key=` (e.g. /client-forms/records/:id/files). */
  opener(base: string): FormFileOpener {
    return (ref: FormFileRef) => void this.download(`${base}?key=${encodeURIComponent(ref.key)}&download=1`, ref.name);
  }

  private async download(path: string, name: string) {
    try {
      const blob = await this.api.fetchBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not open the file', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }
}
