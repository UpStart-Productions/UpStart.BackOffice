import { Component, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommunicationsApi, Interaction } from '../../core/communications.api';

const PREVIEW_WORDS = 100;

function looksLikeHtml(value: string | null | undefined): boolean {
  return !!value && /<\/?[a-z][^>]*>/i.test(value);
}

/** Visible text, so a formatted note is counted and previewed as words. */
function visiblePlain(value: string): string {
  const stripped = looksLikeHtml(value)
    ? value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
    : value;
  return stripped.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function words(plain: string): string[] {
  return plain.split(/\s+/).filter(Boolean);
}

/**
 * The body of an activity item or inbox message. Short notes show in full. Longer ones
 * show the first 100 words, then Show more.
 */
@Component({
  selector: 'app-message-body',
  standalone: true,
  host: { style: 'display: block' },
  template: `
    @if (plain()) {
      <div class="message-panel">
        @if (showRich()) {
          <div class="message-rich ql-editor" [innerHTML]="richHtml()"></div>
        } @else {
          <div class="message-text">{{ shownText() }}</div>
        }
      </div>
      @if (truncated() || item().quoted) {
        <div class="message-actions" (click)="$event.stopPropagation()">
          @if (truncated()) {
            <button type="button" class="link-btn" [attr.aria-expanded]="open()" (click)="open.set(!open())">
              {{ open() ? 'Show less' : 'Show more' }}
            </button>
          }
          @if (item().quoted) {
            <button type="button" class="link-btn" [attr.aria-pressed]="showFull()" [disabled]="loading()" (click)="toggleQuoted()">
              {{ showFull() ? 'Hide quoted text' : 'Show quoted text' }}
            </button>
          }
        </div>
      }
    }
    @if (error()) {
      <div class="message-error text-sm" role="alert">{{ error() }}</div>
    }
  `,
  styles: `
    .message-panel { margin: 0.5rem 0; max-height: 24rem; overflow: auto; background: var(--surface-50, #f9fafb); padding: 0.75rem; border-radius: 6px; }
    .message-text { white-space: pre-wrap; word-break: break-word; font: inherit; }
    .message-rich { padding: 0; height: auto; overflow: visible; }
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
  full = signal<string | null>(null);
  showFull = signal(false);
  private loaded = false;

  /** The text we have without a second request, unless quoted history was opened. */
  private source(): string {
    if (this.showFull() && this.full()) return this.full()!;
    return this.item().bodyText || this.item().snippet || '';
  }

  plain(): string {
    return visiblePlain(this.source());
  }

  truncated(): boolean {
    return words(visiblePlain(this.item().bodyText || this.item().snippet || '')).length > PREVIEW_WORDS;
  }

  shownText(): string {
    const plain = this.plain();
    if (this.open() || this.showFull() || !this.truncated()) return plain;
    return `${words(plain).slice(0, PREVIEW_WORDS).join(' ')}...`;
  }

  showRich(): boolean {
    const raw = this.source();
    return this.item().type !== 'EMAIL' && looksLikeHtml(raw) && (this.open() || !this.truncated());
  }

  richHtml(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.source());
  }

  /** Inbox rows call this when the row is clicked. */
  toggle() {
    if (this.truncated()) {
      this.open.set(!this.open());
      return;
    }
    if (this.item().quoted) void this.toggleQuoted();
  }

  async toggleQuoted() {
    if (this.showFull()) {
      this.showFull.set(false);
      return;
    }
    this.error.set(null);
    if (!this.loaded) {
      this.loading.set(true);
      try {
        const one = await this.comms.interaction(this.item().id);
        this.full.set(one.fullText ?? one.bodyText ?? null);
        this.loaded = true;
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load message');
        return;
      } finally {
        this.loading.set(false);
      }
    }
    if (this.full()) this.showFull.set(true);
  }
}
