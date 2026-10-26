import { DestroyRef, Directive, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Popover } from 'primeng/popover';
import { queuePopoverCenterLayout } from './popover-center.util';

/**
 * Use on every `p-popover` with `appendTo="body"` (via AppPopoverModule).
 * Recenters the panel and caret on the toggle element after Prime positions the overlay.
 */
@Directive({
  selector: 'p-popover[appCenterPopoverCaret]',
  standalone: true,
})
export class CenterPopoverCaretDirective implements OnInit {
  private readonly popover = inject(Popover);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.popover.onShow.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      queuePopoverCenterLayout(this.popover);
    });
  }
}
