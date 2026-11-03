import { Component, input, viewChild } from '@angular/core';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';

/**
 * Inline PrimeNG calendar in a body-appended popover (Timesheet, time entry, Task Manager dates).
 * Borderless calendar fills the popover width — styles in assets/layout/_dropdown-overlays.scss.
 */
@Component({
  selector: 'app-inline-calendar-popover',
  standalone: true,
  imports: [AppPopoverModule],
  template: `
    <p-popover
      #popover
      appendTo="body"
      appCenterPopoverCaret
      styleClass="app-popover app-popover-inline-calendar"
      [dismissable]="dismissable()"
    >
      <div class="inline-calendar-popover">
        <ng-content />
      </div>
    </p-popover>
  `,
})
export class InlineCalendarPopoverComponent {
  dismissable = input(true);

  private readonly popover = viewChild.required<Popover>('popover');

  toggle(event: Event, target?: HTMLElement | EventTarget | null) {
    const el = (target ?? event.currentTarget) as HTMLElement | undefined;
    this.popover().toggle(event, el);
  }

  show(event: Event, target?: HTMLElement | EventTarget | null) {
    const el = (target ?? event.currentTarget) as HTMLElement | undefined;
    this.popover().show(event, el);
  }

  hide() {
    this.popover().hide();
  }
}
