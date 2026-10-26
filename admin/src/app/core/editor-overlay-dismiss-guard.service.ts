import { Injectable } from '@angular/core';

/**
 * Quill toolbars open CDK dialogs/overlays outside the task detail pane. When those close,
 * the same pointer event can hit the page underneath and look like an outside click.
 */
@Injectable({ providedIn: 'root' })
export class EditorOverlayDismissGuard {
  private suppressUntil = 0;

  suppressParentPaneDismissal(ms = 400): void {
    this.suppressUntil = Math.max(this.suppressUntil, Date.now() + ms);
  }

  shouldSuppressParentPaneDismissal(): boolean {
    return Date.now() < this.suppressUntil;
  }
}
