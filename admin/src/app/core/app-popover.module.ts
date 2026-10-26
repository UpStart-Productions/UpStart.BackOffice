import { NgModule } from '@angular/core';
import { PopoverModule } from 'primeng/popover';
import { CenterPopoverCaretDirective } from './center-popover-caret.directive';

/** PrimeNG popover + centered caret on the trigger. Add `appCenterPopoverCaret` on each `p-popover`. */
@NgModule({
  imports: [PopoverModule, CenterPopoverCaretDirective],
  exports: [PopoverModule, CenterPopoverCaretDirective],
})
export class AppPopoverModule {}
