import { Component, computed, inject, input } from '@angular/core';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-copy-email',
  standalone: true,
  styles: `
    .copy-email {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      min-width: 0;
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: copy;
    }

    .copy-email:hover .copy-email__text {
      text-decoration: underline;
    }

    .copy-email--block {
      display: flex;
    }

    .copy-email__text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .copy-email__text--muted {
      font-size: var(--fs-sm);
      color: var(--p-text-muted-color);
    }

    .copy-email-empty {
      color: var(--p-text-muted-color);
    }
  `,
  template: `
    @if (value(); as email) {
      <button
        type="button"
        class="copy-email"
        [class.copy-email--block]="block()"
        [class.copy-email__text--muted]="muted()"
        [title]="'Click to copy ' + email"
        [attr.aria-label]="'Copy ' + email"
        (click)="copy($event, email)"
      >
        <span class="copy-email__text">{{ email }}</span>
      </button>
    } @else if (showEmpty() && emptyLabel().trim()) {
      <span class="copy-email-empty">{{ emptyLabel() }}</span>
    }
  `,
})
export class CopyEmailComponent {
  private readonly toast = inject(MessageService);

  email = input<string | null | undefined>(null);
  muted = input(false);
  block = input(false);
  /** When there is no email: render nothing by default — do not use an em dash (—) as a stand-in for missing data. */
  showEmpty = input(false);
  emptyLabel = input('');
  stopPropagation = input(true);

  readonly value = computed(() => {
    const trimmed = this.email()?.trim();
    return trimmed || null;
  });

  copy(event: Event, email: string) {
    if (this.stopPropagation()) event.stopPropagation();
    void navigator.clipboard.writeText(email);
    this.toast.add({
      severity: 'success',
      summary: 'Copied',
      detail: 'Email copied to clipboard',
      life: 2000,
    });
  }
}
