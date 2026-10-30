import { Component, computed, effect, inject, input, OnDestroy } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MessageModule } from 'primeng/message';

/**
 * A PDF shown in the browser's own viewer (zoom, page through, print), in a white frame. Pass the file as a Blob;
 * it is shown from a local copy, so files from the API's address display instead of downloading.
 * Used by the invoice page (View PDF) and the task attachment viewer.
 */
@Component({
  selector: 'app-pdf-frame',
  standalone: true,
  imports: [MessageModule],
  template: `
    <div class="pdf-frame-wrap">
      @if (loading()) {
        <div class="pdf-frame-loading" aria-busy="true" aria-label="Loading PDF">
          <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
        </div>
      } @else if (error()) {
        <p-message severity="error" [text]="error()!" />
      } @else if (url(); as u) {
        <iframe [src]="u.safe" class="pdf-frame" [title]="title()"></iframe>
      }
    </div>
  `,
  styles: `
    .pdf-frame-wrap {
      border: 1px solid var(--surface-border);
      border-radius: var(--border-radius, 6px);
      overflow: hidden;
      background: #fff;
    }
    .pdf-frame-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: var(--pdf-frame-height, 75vh);
      color: var(--text-color-secondary);
      font-size: var(--fs-xl);
    }
    .pdf-frame {
      display: block;
      width: 100%;
      min-height: var(--pdf-frame-height, 75vh);
      border: none;
      background: #fff;
    }
  `,
})
export class PdfFrameComponent implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);

  blob = input<Blob | null>(null);
  loading = input(false);
  error = input<string | null>(null);
  title = input('PDF');

  protected readonly url = computed(() => {
    const b = this.blob();
    if (!b) return null;
    const raw = URL.createObjectURL(b.type === 'application/pdf' ? b : new Blob([b], { type: 'application/pdf' }));
    return { raw, safe: this.sanitizer.bypassSecurityTrustResourceUrl(raw) };
  });

  private last: string | null = null;

  constructor() {
    // Free the previous local copy when the file changes.
    effect(() => {
      const next = this.url()?.raw ?? null;
      if (this.last && this.last !== next) URL.revokeObjectURL(this.last);
      this.last = next;
    });
  }

  ngOnDestroy() {
    if (this.last) URL.revokeObjectURL(this.last);
  }
}
