import { Injectable, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import type Quill from 'quill';
import { LucideIconPickerDialogComponent } from '@upstart/back-office/lucide-icons';
import { EditorOverlayDismissGuard } from './editor-overlay-dismiss-guard.service';

/**
 * Opens the shared Lucide icon picker (same component the standalone form control uses, see
 * libs/lucide-icons) and inserts the Quill lucideIcon embed at the current selection. Mirrors
 * QuillExternalCtaCoordinator in quill-external-cta-coordinator.service.ts.
 */
@Injectable({ providedIn: 'root' })
export class QuillIconCoordinator {
  private readonly dialog = inject(Dialog);
  private readonly dismissGuard = inject(EditorOverlayDismissGuard);

  handleToolbarClick(quill: Quill): void {
    let range = quill.getSelection(true);
    if (range == null) {
      quill.focus();
      const index = Math.max(0, quill.getLength() - 1);
      quill.setSelection(index, 0, 'silent');
      range = { index, length: 0 };
    }

    const index = range.index;
    this.dismissGuard.suppressParentPaneDismissal();
    const ref = this.dialog.open<string | undefined>(LucideIconPickerDialogComponent, {
      disableClose: false,
      panelClass: 'nmp-quill-icon-dialog-panel',
    });

    ref.closed.subscribe((name) => {
      this.dismissGuard.suppressParentPaneDismissal();
      if (!name) return;
      quill.insertEmbed(index, 'lucideIcon', { name }, 'user');
      quill.setSelection(index + 1, 0, 'silent');
    });
  }
}
