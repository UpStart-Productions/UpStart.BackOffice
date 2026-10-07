import { Directive, inject, OnInit } from '@angular/core';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';

/** Click the backdrop to close. Opt out with `[dismissableMask]="false"`. */
@Directive({
  selector: 'p-dialog:not([data-lock-mask])',
  standalone: true,
})
export class DialogDismissableDirective implements OnInit {
  private readonly dialog = inject(Dialog);

  ngOnInit(): void {
    this.dialog.dismissableMask = true;
  }
}

/** Same behavior for delete confirmations and other confirm dialogs. */
@Directive({
  selector: 'p-confirmDialog:not([data-lock-mask]), p-confirmdialog:not([data-lock-mask]), p-confirm-dialog:not([data-lock-mask])',
  standalone: true,
})
export class ConfirmDialogDismissableDirective implements OnInit {
  private readonly dialog = inject(ConfirmDialog);

  ngOnInit(): void {
    this.dialog.dismissableMask = true;
  }
}
