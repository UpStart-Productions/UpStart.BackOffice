import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AppDialogModule } from '../../core/app-dialog.module';
import { PdfFrameComponent } from '../pdf-frame/pdf-frame.component';

/** What the viewer shows. `url` is a public file address; `loadBlob` loads it another way (e.g. signed in). */
export type ViewerFile = {
  name: string;
  kind: 'image' | 'video' | 'pdf';
  url?: string | null;
  /** PDFs: how to get the file when it isn't at a public address. */
  loadBlob?: () => Promise<Blob>;
  /** Download: replaces the default (fetch the file and save it). */
  download?: () => Promise<void>;
};

/**
 * One window for viewing a photo, video or PDF, with Download under it. Download saves the file without
 * opening it. Used for task attachments and an invoice's PDF.
 */
@Component({
  selector: 'app-file-viewer-dialog',
  standalone: true,
  imports: [AppDialogModule, PdfFrameComponent],
  template: `
    <p-dialog
      [header]="file()?.name ?? ''"
      [visible]="!!file()"
      (visibleChange)="!$event && closed.emit()"
      [modal]="true"
      [dismissableMask]="true"
      [draggable]="false"
      [style]="{ width: 'min(60rem, 96vw)' }"
      appendTo="body"
    >
      @if (file(); as f) {
        @switch (f.kind) {
          @case ('video') {
            <video class="fv-media" [src]="f.url" controls autoplay playsinline></video>
          }
          @case ('pdf') {
            <app-pdf-frame class="fv-pdf" [blob]="pdf()" [loading]="pdfLoading()" [error]="pdfError()" [title]="f.name" />
          }
          @default {
            <img class="fv-media fv-image" [src]="f.url" [alt]="f.name" />
          }
        }
        <div class="fv-footer">
          <a [href]="f.url ?? '#'" class="text-primary" (click)="download(f, $event)"><i class="pi pi-download mr-1"></i>Download</a>
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .fv-media {
      display: block;
      width: 100%;
      max-height: 70vh;
      background: #000;
      border-radius: 6px;
    }
    .fv-image {
      object-fit: contain;
      background: var(--surface-ground);
    }
    .fv-pdf {
      display: block;
      --pdf-frame-height: 70vh;
    }
    .fv-footer {
      margin-top: 0.75rem;
    }
  `,
})
export class FileViewerDialogComponent {
  private readonly toast = inject(MessageService);

  file = input<ViewerFile | null>(null);
  closed = output<void>();

  protected readonly pdf = signal<Blob | null>(null);
  protected readonly pdfLoading = signal(false);
  protected readonly pdfError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const f = this.file();
      untracked(() => {
        this.pdf.set(null);
        this.pdfError.set(null);
        if (f?.kind === 'pdf') void this.loadPdf(f);
      });
    });
  }

  private async loadPdf(f: ViewerFile) {
    this.pdfLoading.set(true);
    try {
      const blob = f.loadBlob ? await f.loadBlob() : await this.fetchBlob(f.url);
      if (this.file() === f) this.pdf.set(blob);
    } catch (err) {
      if (this.file() === f) this.pdfError.set(err instanceof Error ? err.message : 'The PDF could not be loaded.');
    } finally {
      this.pdfLoading.set(false);
    }
  }

  /**
   * Save without opening. Files come from the API's address, where browsers ignore the download attribute,
   * so fetch the file and save a local copy.
   */
  protected async download(f: ViewerFile, event: MouseEvent) {
    event.preventDefault();
    try {
      if (f.download) return await f.download();
      const blob = f.kind === 'pdf' && this.pdf() ? this.pdf()! : f.loadBlob ? await f.loadBlob() : await this.fetchBlob(f.url);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = f.name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Download failed', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  private async fetchBlob(url: string | null | undefined): Promise<Blob> {
    if (!url) throw new Error('This file has no address.');
    const res = await fetch(url);
    if (!res.ok) throw new Error('The file could not be loaded.');
    return res.blob();
  }
}
