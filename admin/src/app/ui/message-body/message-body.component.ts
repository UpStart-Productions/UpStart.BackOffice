import { Component, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommunicationsApi, Interaction } from '../../core/communications.api';

function looksLikeHtml(value: string | null | undefined): boolean {
  return !!value && /<\/?[a-z][^>]*>/i.test(value);
}

/**
 * Snippet of a captured message with "Read more" / "Show quoted text". Loads the full
 * body on demand. Parents can call `toggle()` through a template ref (e.g. row click).
 */
@Component({
  selector: 'app-message-body',
  standalone: true,
  host: { style: 'display: block' },
  template: `
    @if (open()) {
      @if (rich()) {
        <div class="message-rich ql-editor" [innerHTML]="richHtml()"></div>
      } @else {
        <pre class="message-text" tabindex="0">{{ showFull() && full() ? full() : body() }}</pre>
      }
    } @else if (item().snippet) {
      <div class="message-snippet">{{ item().snippet }}</div>
    }
    @if (item().snippet) {
      <div class="message-actions" (click)="$event.stopPropagation()">
        <button type="button" class="link-btn" [attr.aria-expanded]="open()" [disabled]="loading()" (click)="toggle()">
          {{ open() ? 'Show less' : 'Read more' }}
        </button>
        @if (open() && full()) {
          <button type="button" class="link-btn" [attr.aria-pressed]="showFull()" (click)="showFull.set(!showFull())">
            {{ showFull() ? 'Hide quoted text' : 'Show quoted text' }}
          </button>
        }
      </div>
    }
    @if (error()) {
      <div class="message-error text-sm" role="alert">{{ error() }}</div>
    }
  `,
  styles: `
    .message-snippet { margin: 0.25rem 0; color: var(--text-color-secondary); }
    .message-text { margin: 0.5rem 0; white-space: pre-wrap; word-break: break-word; font: inherit; max-height: 24rem; overflow: auto; background: var(--surface-50, #f9fafb); padding: 0.75rem; border-radius: 6px; }
    .message-rich { margin: 0.35rem 0; padding: 0; height: auto; overflow: visible; }
    .message-actions { display: flex; gap: 1rem; margin-top: 0.25rem; }
    .message-error { color: var(--color-error, #dc2626); margin-top: 0.25rem; }
  `,
})
export class MessageBodyComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly sanitizer = inject(DomSanitizer);

  item = input.required<Interaction>();

  open = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  body = signal('');
  full = signal<string | null>(null);
  showFull = signal(false);
  private loaded = false;

  rich(): boolean {
    return this.item().type !== 'EMAIL' && looksLikeHtml(this.showFull() && this.full() ? this.full() : this.body());
  }

  richHtml(): SafeHtml {
    const html = this.showFull() && this.full() ? this.full() : this.body();
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  async toggle() {
    const item = this.item();
    if (!item.snippet || this.loading()) return;
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.error.set(null);
    if (!this.loaded) {
      this.loading.set(true);
      try {
        const one = await this.comms.interaction(item.id);
        this.body.set(one.bodyText ?? item.snippet ?? '');
        this.full.set(one.fullText ?? null);
        this.loaded = true;
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load message');
        return;
      } finally {
        this.loading.set(false);
      }
    }
    this.showFull.set(false);
    this.open.set(true);
  }
}
