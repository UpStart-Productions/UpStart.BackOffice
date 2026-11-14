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
  private styleObserver: MutationObserver | null = null;

  ngOnInit(): void {
    const relayout = () => {
      if (this.popover.overlayVisible) queuePopoverCenterLayout(this.popover);
    };

    document.addEventListener('scroll', relayout, true);
    window.addEventListener('resize', relayout);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', relayout, true);
      window.removeEventListener('resize', relayout);
      this.disconnectStyleObserver();
    });

    this.popover.onShow.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      queuePopoverCenterLayout(this.popover);
      this.connectStyleObserver();
    });

    this.popover.onHide.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.disconnectStyleObserver();
    });
  }

  /** Prime reapplies absolute positioning via pBind; re-center when the overlay style changes. */
  private connectStyleObserver() {
    this.disconnectStyleObserver();
    const container = this.popover.container;
    if (!(container instanceof HTMLElement)) return;
    this.styleObserver = new MutationObserver(() => {
      if (!this.popover.overlayVisible) return;
      const el = this.popover.container;
      if (!(el instanceof HTMLElement)) return;
      // Prime's pBind puts position:absolute back; only re-run when that happens (avoid observer loops).
      if (getComputedStyle(el).position === 'absolute') queuePopoverCenterLayout(this.popover);
    });
    this.styleObserver.observe(container, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  private disconnectStyleObserver() {
    this.styleObserver?.disconnect();
    this.styleObserver = null;
  }
}
