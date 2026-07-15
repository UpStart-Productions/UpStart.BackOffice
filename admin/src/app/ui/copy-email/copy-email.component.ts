import { Component, computed, inject, input } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-copy-email',
  standalone: true,
  imports: [ButtonModule],
  styles: `
    .copy-email {
      display: inline-flex;
      align-items: center;
      gap: 0.125rem;
      max-width: 100%;
      min-width: 0;
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
      font-size: 0.8125rem;
      color: var(--p-text-muted-color);
    }

    .copy-email-empty {
      color: var(--p-text-muted-color);
    }
  `,
  template: `
    @if (value(); as email) {
      <span class="copy-email" [class.copy-email--block]="block()">
        <span class="copy-email__text" [class.copy-email__text--muted]="muted()">{{ email }}</span>
        <button
          type="button"
          pButton
          icon="pi pi-copy"
          [text]="true"
          size="small"
          [attr.aria-label]="'Copy ' + email"
          (click)="copy($event, email)"
        ></button>
      </span>
    } @else if (showEmpty()) {
      <span class="copy-email-empty">{{ emptyLabel() }}</span>
    }
  `,
})
export class CopyEmailComponent {
  private readonly toast = inject(MessageService);

  email = input<string | null | undefined>(null);
  muted = input(false);
  block = input(false);
  showEmpty = input(true);
  emptyLabel = input('—');
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
