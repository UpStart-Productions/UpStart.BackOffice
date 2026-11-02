import { Component, input } from '@angular/core';
import type { AutoSaveState } from '../../core/auto-saver';

/** The auto-save line: Saving…, Saved, or Not saved, retrying. Nothing before the first change. */
@Component({
  selector: 'app-save-status',
  standalone: true,
  template: `
    @switch (state()) {
      @case ('saving') {
        <span class="save-status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Saving…</span>
      }
      @case ('saved') {
        <span class="save-status"><i class="pi pi-check" aria-hidden="true"></i> Saved</span>
      }
      @case ('error') {
        <span class="save-status save-status--error"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> Not saved, retrying</span>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
    .save-status {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--text-color-secondary);
      white-space: nowrap;
    }
    .save-status--error {
      color: var(--color-severity-danger-text);
    }
  `,
  host: { 'aria-live': 'polite' },
})
export class SaveStatusComponent {
  state = input<AutoSaveState>('idle');
}
