import { Component, input, output, viewChild } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';
import { InlineCalendarPopoverComponent } from '../inline-calendar-popover/inline-calendar-popover.component';

/**
 * Date navigator: ‹ label › | calendar, as one control (Timesheet, Schedule).
 * The calendar button opens a popover with whatever you put inside (usually an inline p-datepicker).
 * Call hide() after a pick (e.g. pass the component to your onSelect handler).
 */
@Component({
  selector: 'app-date-nav',
  standalone: true,
  imports: [InlineCalendarPopoverComponent, TooltipModule, LucideIconComponent],
  template: `
    <div class="date-nav-control">
      <button type="button" class="nav-btn" (click)="prev.emit()" [attr.aria-label]="prevLabel()">‹</button>
      <span class="date-label">{{ label() }}</span>
      <button type="button" class="nav-btn" (click)="next.emit()" [attr.aria-label]="nextLabel()">›</button>
      <span class="date-nav-divider" aria-hidden="true"></span>
      <button
        type="button"
        class="nav-btn date-nav-calendar"
        (click)="openCalendar($event)"
        aria-label="Pick a date"
        aria-haspopup="dialog"
        pTooltip="Pick a date"
        tooltipPosition="top"
        tooltipStyleClass="ubo-dark-tooltip"
        [showDelay]="tooltipDelayMs"
      >
        <nmp-lucide-icon name="calendar" aria-hidden="true" />
      </button>
    </div>
    <app-inline-calendar-popover #popover>
      <ng-content />
    </app-inline-calendar-popover>
  `,
})
export class DateNavComponent {
  label = input.required<string>();
  prevLabel = input('Previous');
  nextLabel = input('Next');
  prev = output<void>();
  next = output<void>();
  /** Fired when the calendar opens (e.g. to load data for the month shown). */
  calendarOpen = output<void>();

  readonly tooltipDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;
  private readonly popover = viewChild.required<InlineCalendarPopoverComponent>('popover');

  openCalendar(event: Event) {
    this.popover().toggle(event, event.currentTarget as HTMLElement);
    this.calendarOpen.emit();
  }

  hide() {
    this.popover().hide();
  }
}
