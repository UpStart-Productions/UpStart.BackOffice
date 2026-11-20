import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import type { VisitDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { dateKey } from '../../core/date.util';
import { VisitsApi } from '../../core/visits.api';
import { SchedulePage } from '../../pages/schedule/schedule.page';
import { VisitCardComponent } from '../record-card/visit-card.component';

/**
 * A client's schedule in the side panel: a month calendar with a dot on days that have visits; the picked day's visits
 * below as visit cards. Expand opens the full Week/Month schedule over the page, locked to this client, so visits can
 * be added and changed without leaving the client. Cancelled visits aren't shown here.
 */
@Component({
  selector: 'app-client-schedule-widget',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DatePickerModule, AppDialogModule, SchedulePage, VisitCardComponent],
  styles: `
    :host {
      display: block;
    }
    .csw-calendar :is(.p-datepicker) {
      width: 100%;
    }
    .cal-day {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }
    .cal-day--visits::after {
      content: '';
      position: absolute;
      bottom: 2px;
      left: 50%;
      width: 5px;
      height: 5px;
      margin-left: -2.5px;
      border-radius: 50%;
      background: var(--p-primary-color);
    }
    .csw-day-title {
      margin: 1rem 0 0.5rem;
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--text-color-secondary);
    }
  `,
  template: `
    <div class="card card--side">
      <div class="card-header">
        <h2 class="card-title">Schedule</h2>
        <p-button label="Expand" icon="pi pi-window-maximize" severity="secondary" [text]="true" size="small" (onClick)="expanded.set(true)" />
      </div>
      <div class="csw-calendar">
        <p-datepicker [inline]="true" [ngModel]="selectedDay()" (ngModelChange)="selectedDay.set($event)" (onMonthChange)="onMonthChange($event)">
          <ng-template #date let-date>
            <span class="cal-day" [class.cal-day--visits]="hasVisits(date)">{{ date.day }}</span>
          </ng-template>
        </p-datepicker>
      </div>
      <p class="csw-day-title">{{ selectedDay() | date: 'EEEE, MMM d' }}</p>
      <div class="side-list">
        @for (v of dayVisits(); track v.id) {
          <app-visit-card [visit]="v" />
        } @empty {
          <p class="side-list-empty m-0">No visits this day.</p>
        }
      </div>
    </div>

    @if (expanded()) {
      <p-dialog
        [header]="clientName() ? 'Schedule: ' + clientName() : 'Schedule'"
        [visible]="true"
        (visibleChange)="$event ? null : close()"
        [modal]="true"
        [dismissableMask]="false"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: '96vw', height: '94vh' }"
        [contentStyle]="{ overflow: 'auto' }"
      >
        <app-schedule-page [embedded]="true" [clientLock]="clientId()" />
      </p-dialog>
    }
  `,
})
export class ClientScheduleWidgetComponent {
  private readonly visitsApi = inject(VisitsApi);

  clientId = input.required<string>();
  clientName = input('');
  /** The full schedule was closed (visits may have changed). */
  changed = output<void>();

  selectedDay = signal(new Date());
  /** First day of the month the calendar shows. */
  private readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  private readonly visits = signal<VisitDto[]>([]);
  expanded = signal(false);

  private readonly byDay = computed(() => {
    const map = new Map<string, VisitDto[]>();
    for (const v of this.visits()) {
      const k = dateKey(new Date(v.startAt));
      map.set(k, [...(map.get(k) ?? []), v]);
    }
    return map;
  });
  readonly dayVisits = computed(() => this.byDay().get(dateKey(this.selectedDay())) ?? []);

  constructor() {
    effect(() => {
      void this.load(this.clientId(), this.month());
    });
  }

  hasVisits(date: { day: number; month: number; year: number }): boolean {
    return this.byDay().has(dateKey(new Date(date.year, date.month, date.day)));
  }

  /** PrimeNG gives a 1-based month. */
  onMonthChange(event: { month?: number; year?: number }) {
    if (!event.month || !event.year) return;
    this.month.set(new Date(event.year, event.month - 1, 1));
  }

  close() {
    this.expanded.set(false);
    void this.load(this.clientId(), this.month());
    this.changed.emit();
  }

  /** The shown month plus a week either side (the calendar shows days of the next and last month). */
  private async load(clientId: string, month: Date) {
    const from = new Date(month.getFullYear(), month.getMonth(), -6);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 8);
    try {
      const rows = await this.visitsApi.visits({ from: from.toISOString(), to: to.toISOString(), clientId });
      this.visits.set(rows.filter((v) => v.status !== 'CANCELLED'));
    } catch {
      this.visits.set([]);
    }
  }
}
