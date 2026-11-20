import { Injectable, signal } from '@angular/core';

/** Opens a visit in the one visit modal (mounted in the shell). Lists that show visits reload when `changed` moves. */
@Injectable({ providedIn: 'root' })
export class VisitDetailService {
  readonly visitId = signal<string | null>(null);
  /** The tab to open on: a form's id, else the log. */
  readonly tab = signal<string>('log');
  /** Bumped when the modal closes (the visit may have been started, finished, edited or deleted). */
  readonly changed = signal(0);

  /** Open a visit's log; with formId, on that form's tab. */
  open(id: string, formId?: string) {
    this.tab.set(formId ?? 'log');
    this.visitId.set(id);
  }

  close() {
    if (!this.visitId()) return;
    this.visitId.set(null);
    this.changed.update((n) => n + 1);
  }
}
