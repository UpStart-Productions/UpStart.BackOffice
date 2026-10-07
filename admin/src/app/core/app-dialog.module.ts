import { NgModule } from '@angular/core';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogDismissableDirective, DialogDismissableDirective } from './dialog-dismissable.directive';

/** PrimeNG dialog with click-outside-to-close enabled by default. */
@NgModule({
  imports: [DialogModule, DialogDismissableDirective],
  exports: [DialogModule, DialogDismissableDirective],
})
export class AppDialogModule {}

/** PrimeNG confirm dialog with click-outside-to-close enabled by default. */
@NgModule({
  imports: [ConfirmDialogModule, ConfirmDialogDismissableDirective],
  exports: [ConfirmDialogModule, ConfirmDialogDismissableDirective],
})
export class AppConfirmDialogModule {}
