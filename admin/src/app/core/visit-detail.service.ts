import { Injectable, signal } from '@angular/core';

/** Opens a visit in the one visit modal (mounted in the shell). Lists that show visits reload when `changed` moves. */
@Injectable({ providedIn: 'root' })
export class VisitDetailService {
  readonly visitId = signal<string | null>(null);
  /** Bumped when the modal closes (the visit may have been started, finished, edited or deleted). */
  readonly changed = signal(0);

  open(id: string) {
    this.visitId.set(id);
  }

  close() {
    if (!this.visitId()) return;
    this.visitId.set(null);
    this.changed.update((n) => n + 1);
  }
}
