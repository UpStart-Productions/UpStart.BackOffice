import { Component, input, output, computed, signal, viewChild, type TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  format,
  addDays,
  type Locale,
} from 'date-fns';
import { enUS } from 'date-fns/locale';

/**
 * A month calendar (ported from GrovLink's dashboard): days with events are tinted; clicking one opens a popover
 * listing that day's events, and picking one emits eventClicked. The month moves with ‹ › (viewDateChange).
 */
export interface CalendarEvent<T = unknown> {
  start: Date;
  end?: Date;
  title: string;
  /** Second line in the day popover (default: the date or date range). */
  subtitle?: string;
  meta?: T;
  color?: { primary: string; secondary?: string };
  /** Display label for event type (e.g. "Event", "CTA", "Class") shown in tooltip */
  typeLabel?: string;
}

@Component({
  selector: 'app-month-calendar',
  standalone: true,
  imports: [CommonModule, AppPopoverModule],
  template: `
    <div class="month-calendar" [class.month-calendar--embedded]="!showMonthNav()">
      @if (showMonthNav()) {
        <div class="calendar-header">
          <button type="button" class="calendar-nav-btn" (click)="prevMonth()" aria-label="Previous month">
            <i class="pi pi-chevron-left"></i>
          </button>
          <h5 class="calendar-title mb-0">{{ monthTitle() }}</h5>
          <button type="button" class="calendar-nav-btn" (click)="nextMonth()" aria-label="Next month">
            <i class="pi pi-chevron-right"></i>
          </button>
        </div>
      }

      <div class="calendar-days-header">
        @for (day of dayHeaders(); track day) {
          <div class="calendar-days-header-cell">{{ day }}</div>
        }
      </div>

      <div class="calendar-grid">
        @for (week of weeks(); track week[0].getTime()) {
          <div class="calendar-row">
            @for (day of week; track day.getTime()) {
              @let dayEvents = getEventsForDay(day);
              <div
                class="calendar-cell calendar-cell-day"
                [class.calendar-cell-out-month]="!isSameMonth(day)"
              >
                @if (dayEvents.length > 0) {
                  <button
                    type="button"
                    class="calendar-day-number-wrap"
                    [class.calendar-day-number-wrap--today]="isToday(day)"
                    [class.calendar-day-number-wrap--has-events]="!isToday(day)"
                    (click)="openDayEventsPopover(day, dayEvents, $event)"
                    aria-haspopup="dialog"
                  >
                    <span class="calendar-day-number">{{ format(day, 'd') }}</span>
                  </button>
                } @else {
                  <span
                    class="calendar-day-number-wrap"
                    [class.calendar-day-number-wrap--today]="isToday(day)"
                  >
                    <span class="calendar-day-number">{{ format(day, 'd') }}</span>
                  </span>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>

    <p-popover
      #dayEventsPopover
      appCenterPopoverCaret
      appendTo="body"
      styleClass="calendar-day-events-popover"
      [dismissable]="true"
      [style]="popoverPanelStyle"
      (onShow)="onDayEventsPopoverShow()"
      (onHide)="onDayEventsPopoverHide()"
    >
      @if (dayEventsPopoverContext(); as ctx) {
        <div class="calendar-day-events-popover-inner">
          <h6 class="m-0 mb-2">{{ formatPopoverDayDate(ctx.day) }}</h6>
          <div class="calendar-day-events-popover-panel">
            <ul class="list-rows mb-0">
              @for (ev of ctx.events; track eventRowTrack(ev, $index)) {
                <li class="list-row--bordered calendar-day-events-popover-item">
                  @if (eventTemplate(); as tpl) {
                    <!-- Custom row (it may hold links, e.g. a person card): click anywhere else on it to pick the event. -->
                    <div class="calendar-day-events-popover-row calendar-day-events-popover-row--custom" role="button" tabindex="0" (click)="selectEventFromPopover(ev, $event)" (keydown.enter)="selectEventFromPopover(ev, $event)">
                      <ng-container *ngTemplateOutlet="tpl; context: { $implicit: ev }" />
                    </div>
                  } @else {
                    <button
                      type="button"
                      class="calendar-day-events-popover-row"
                      (click)="selectEventFromPopover(ev, $event)"
                    >
                      @if (ev.typeLabel) {
                        <span class="text-color-secondary">{{ ev.typeLabel }}</span>
                      }
                      <strong class="calendar-day-events-popover-title">{{ ev.title }}</strong>
                      <span class="text-color-secondary">{{ ev.subtitle ?? formatEventListSubtitle(ev) }}</span>
                    </button>
                  }
                </li>
              }
            </ul>
          </div>
        </div>
      }
    </p-popover>
  `,
  styles: [
    `
      .month-calendar {
        font-size: 0.75rem;
        margin-top: 0.5rem;
      }

      .month-calendar--embedded {
        margin-top: 0;
      }

      .calendar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: calc(0.5rem + 5px);
        font-size: 1rem;
      }

      .calendar-title {
        flex: 1;
        text-align: center;
        margin: 0;
        font-size: 1em;
        font-weight: 700;
        line-height: 1.25;
      }

      .calendar-nav-btn {
        background: none;
        border: none;
        padding: 0.25rem;
        cursor: pointer;
        color: var(--text-color);
        border-radius: var(--content-border-radius);
        font-size: 1em;
        line-height: 1;
      }

      .calendar-nav-btn:hover {
        background: var(--surface-hover);
      }

      .calendar-days-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        font-weight: 600;
        font-size: 0.7rem;
        color: var(--text-color-secondary);
        padding-bottom: 0.35rem;
      }

      .calendar-days-header-cell {
        text-align: center;
        padding: 0.15rem 0;
      }

      .calendar-grid {
        border: none;
      }

      .calendar-row {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        border: none;
      }

      .calendar-cell-day {
        min-height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.125rem;
        border: none;
      }

      .calendar-cell-out-month .calendar-day-number-wrap {
        opacity: 0.35;
      }

      .calendar-day-number-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 1.85rem;
        min-height: 1.85rem;
        padding: 0.2rem 0.4rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        font: inherit;
        line-height: 1;
        color: var(--text-color);
        cursor: default;
      }

      .calendar-day-number-wrap--has-events {
        background: var(--brand-violet-100);
        cursor: pointer;
      }

      .calendar-day-number-wrap--has-events:hover {
        filter: brightness(0.96);
      }

      .calendar-day-number-wrap--today {
        background: var(--brand-primary);
        color: #fff;
        font-weight: 600;
      }

      .calendar-day-number-wrap--today.calendar-day-number-wrap--has-events {
        cursor: pointer;
      }

      .calendar-day-number-wrap--today .calendar-day-number {
        color: inherit;
      }

      .calendar-day-number {
        display: block;
        text-align: center;
      }

      /* Clicks register on the button so popover anchoring uses the full day cell, not the inner span. */
      button.calendar-day-number-wrap .calendar-day-number {
        pointer-events: none;
      }

      .calendar-day-events-popover-inner {
        font-size: 1rem;
      }

      .calendar-day-events-popover-panel {
        max-height: min(70vh, 24rem);
        overflow-y: auto;
      }

      .calendar-day-events-popover-title {
        display: block;
        margin: 0;
        font-weight: 700;
        line-height: 1.3;
      }

      .calendar-day-events-popover-item {
        display: flex;
        padding: 0.625rem 0;
      }

      .calendar-day-events-popover-row {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.35rem;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        text-align: left;
        font: inherit;
        color: inherit;
      }

      .calendar-day-events-popover-row--custom {
        align-items: stretch;
      }

      .calendar-day-events-popover-row:hover {
        opacity: 0.85;
      }
    `,
  ],
})
export class MonthCalendarComponent<T = unknown> {
  viewDate = input.required<Date>();
  events = input<CalendarEvent<T>[]>([]);
  weekStartsOn = input<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);

  /** How each event shows in the day popover (e.g. a person card). Default: type, title and date. */
  eventTemplate = input<TemplateRef<{ $implicit: CalendarEvent<T> }> | null>(null);

  /** When false, hides the month title and prev/next row (e.g. when shown in a parent header). */
  showMonthNav = input<boolean>(true);

  eventClicked = output<{ event: CalendarEvent<T>; sourceEvent: Event }>();
  viewDateChange = output<Date>();

  private readonly locale: Locale = enUS;

  /** ~20% narrower than the previous min(26rem, 100vw - 2rem) panel */
  protected readonly popoverPanelStyle = {
    width: 'min(20.8rem, calc((100vw - 2rem) * 0.8))',
  };

  private readonly dayEventsPopoverRef = viewChild<Popover>('dayEventsPopover');

  /** True while the day-events popover is visible (updated in onShow / onHide). */
  private dayEventsPopoverOpen = false;

  /** When true, the next onHide is from re-anchoring to another day — do not clear context. */
  private skipNextDayEventsPopoverHideClear = false;

  /** Day cell button last used to open / re-anchor the popover (for alignment). */
  private lastDayPopoverAnchor: HTMLElement | null = null;

  protected readonly dayEventsPopoverContext = signal<{
    day: Date;
    events: CalendarEvent<T>[];
  } | null>(null);

  protected formatPopoverDayDate(day: Date): string {
    return format(day, 'MMM d, yyyy', { locale: this.locale });
  }

  protected monthTitle = computed(() =>
    format(this.viewDate(), 'MMMM yyyy', { locale: this.locale })
  );

  protected dayHeaders = computed(() => {
    const headers: string[] = [];
    const start = startOfWeek(new Date(), { weekStartsOn: this.weekStartsOn() });
    for (let i = 0; i < 7; i++) {
      headers.push(format(addDays(start, i), 'EE', { locale: this.locale }));
    }
    return headers;
  });

  protected weeks = computed(() => {
    const view = this.viewDate();
    const monthStart = startOfMonth(view);
    const monthEnd = endOfMonth(view);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: this.weekStartsOn() });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: this.weekStartsOn() });

    const weeks: Date[][] = [];
    let current = calendarStart;

    while (current <= calendarEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(current);
        current = addDays(current, 1);
      }
      weeks.push(week);
    }

    return weeks;
  });

  protected isSameMonth(date: Date): boolean {
    return isSameMonth(date, this.viewDate());
  }

  protected isToday(date: Date): boolean {
    return isSameDay(date, new Date());
  }

  protected format(date: Date, fmt: string): string {
    return format(date, fmt, { locale: this.locale });
  }

  protected getEventsForDay(day: Date): CalendarEvent<T>[] {
    return (this.events() ?? []).filter((ev) => {
      const start = ev.start;
      const end = ev.end ?? start;
      return (
        isSameDay(start, day) ||
        isSameDay(end, day) ||
        (start <= day && end >= day)
      );
    });
  }

  prevMonth(): void {
    this.dayEventsPopoverRef()?.hide();
    this.viewDateChange.emit(subMonths(this.viewDate(), 1));
  }

  nextMonth(): void {
    this.dayEventsPopoverRef()?.hide();
    this.viewDateChange.emit(addMonths(this.viewDate(), 1));
  }

  protected formatEventListSubtitle(ev: CalendarEvent<T>): string {
    const startStr = format(ev.start, 'MMM d, yyyy', { locale: this.locale });
    const end = ev.end ?? ev.start;
    if (isSameDay(ev.start, end)) return startStr;
    return `${startStr} – ${format(end, 'MMM d, yyyy', { locale: this.locale })}`;
  }

  protected eventRowTrack(ev: CalendarEvent<T>, index: number): string {
    return `${ev.start.getTime()}-${ev.title}-${index}`;
  }

  openDayEventsPopover(day: Date, events: CalendarEvent<T>[], e: MouseEvent): void {
    e.stopPropagation();
    const anchor = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    this.lastDayPopoverAnchor = anchor;

    const pop = this.dayEventsPopoverRef();
    this.dayEventsPopoverContext.set({ day, events });

    const showPopover = (): void => {
      const p = this.dayEventsPopoverRef();
      if (!p) return;
      if (this.lastDayPopoverAnchor) {
        p.show(e, this.lastDayPopoverAnchor);
      } else {
        p.show(e);
      }
    };

    if (this.dayEventsPopoverOpen) {
      this.skipNextDayEventsPopoverHideClear = true;
      pop?.hide();
      requestAnimationFrame(() => {
        requestAnimationFrame(showPopover);
      });
      return;
    }

    queueMicrotask(showPopover);
  }

  onDayEventsPopoverShow(): void {
    this.dayEventsPopoverOpen = true;
    this.skipNextDayEventsPopoverHideClear = false;
  }

  onDayEventsPopoverHide(): void {
    if (this.skipNextDayEventsPopoverHideClear) {
      return;
    }
    this.dayEventsPopoverOpen = false;
    this.lastDayPopoverAnchor = null;
    this.dayEventsPopoverContext.set(null);
  }

  selectEventFromPopover(event: CalendarEvent<T>, e: Event): void {
    // A link or button inside a custom row (e.g. a person's name) does its own thing.
    const hit = e.target instanceof Element ? e.target.closest('a, button') : null;
    if (hit && hit !== e.currentTarget) return;
    e.stopPropagation();
    this.dayEventsPopoverRef()?.hide();
    this.eventClicked.emit({ event, sourceEvent: e });
  }
}
