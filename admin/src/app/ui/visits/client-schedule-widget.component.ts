import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { VisitDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { VisitsApi } from '../../core/visits.api';
import { SchedulePage } from '../../pages/schedule/schedule.page';
import { MonthCalendarComponent, type CalendarEvent } from '../calendar/month-calendar.component';
import { PersonCardComponent } from '../record-card/person-card.component';

/**
 * A client's schedule in the side panel: a month calendar where days with visits are tinted; click one to see that
 * day's visits and open one. Expand opens the full Week/Month schedule over the page, locked to this client, so
 * visits can be added and changed without leaving the client. Cancelled visits aren't shown here.
 */
@Component({
  selector: 'app-client-schedule-widget',
  standalone: true,
  imports: [ButtonModule, AppDialogModule, SchedulePage, MonthCalendarComponent, PersonCardComponent],
  providers: [DatePipe],
  styles: `
    .csw-visit-label {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
    }
  `,
  template: `
    <div class="card card--side">
      <div class="card-header">
        <h2 class="card-title">Schedule</h2>
        <p-button label="Expand" icon="pi pi-window-maximize" severity="secondary" [text]="true" size="small" (onClick)="expanded.set(true)" />
      </div>
      <app-month-calendar
        [viewDate]="viewDate()"
        [events]="events()"
        [eventTemplate]="visitRow"
        (viewDateChange)="viewDate.set($event)"
        (eventClicked)="openVisit($event.event)"
      />
    </div>

    <!-- A visit in the day popover: its type and times above the team member's person card. -->
    <ng-template #visitRow let-ev>
      <span class="csw-visit-label">{{ ev.typeLabel }} · {{ ev.subtitle }}</span>
      @if (ev.meta?.teamMember; as m) {
        <app-person-card kind="user" [person]="m" />
      } @else {
        <span class="csw-visit-label">Unassigned</span>
      }
    </ng-template>

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
  private readonly router = inject(Router);
  private readonly datePipe = inject(DatePipe);

  clientId = input.required<string>();
  clientName = input('');
  /** The full schedule was closed (visits may have changed). */
  changed = output<void>();

  /** Any day in the month the calendar shows. */
  viewDate = signal(new Date());
  private readonly visits = signal<VisitDto[]>([]);
  expanded = signal(false);

  /** Each visit as a calendar event: the visit type, then who and when. */
  readonly events = computed<CalendarEvent<VisitDto>[]>(() =>
    this.visits().map((v) => ({
      start: new Date(v.startAt),
      title: v.teamMember?.name ?? 'Unassigned',
      typeLabel: v.visitType.name,
      subtitle: `${this.datePipe.transform(v.startAt, 'h:mm a')} – ${this.datePipe.transform(v.endAt, 'h:mm a')}`,
      meta: v,
    })),
  );

  constructor() {
    effect(() => {
      const d = this.viewDate();
      void this.load(this.clientId(), new Date(d.getFullYear(), d.getMonth(), 1));
    });
  }

  openVisit(event: CalendarEvent<VisitDto>) {
    if (event.meta) void this.router.navigate(['/visits', event.meta.id]);
  }

  close() {
    this.expanded.set(false);
    const d = this.viewDate();
    void this.load(this.clientId(), new Date(d.getFullYear(), d.getMonth(), 1));
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
