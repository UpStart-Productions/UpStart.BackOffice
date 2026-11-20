import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { VisitDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { VisitsApi } from '../../core/visits.api';
import { SchedulePage } from '../../pages/schedule/schedule.page';
import { MonthCalendarComponent, type CalendarEvent } from '../calendar/month-calendar.component';
import { PeopleSelectComponent } from '../people-select/people-select.component';
import { VisitCardComponent } from '../record-card/visit-card.component';

/**
 * A client's schedule in the side panel: a month calendar where days with visits are tinted; click one to see that
 * day's visits and open one. Expand opens the full Week/Month schedule over the page, locked to this client, so
 * visits can be added and changed without leaving the client. Cancelled visits aren't shown here.
 */
@Component({
  selector: 'app-client-schedule-widget',
  standalone: true,
  imports: [ButtonModule, AppDialogModule, SchedulePage, MonthCalendarComponent, VisitCardComponent, PeopleSelectComponent],
  providers: [DatePipe],
  styles: `
    .csw-dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex: 1 1 auto;
      min-width: 0;
      margin-right: 1rem;
    }
    .csw-team-member {
      width: 18rem;
    }
    .csw-dialog-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
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

    <!-- A visit in the day popover: the same visit card as the Visits list (status, times, team member). -->
    <ng-template #visitRow let-ev>
      <app-visit-card [visit]="ev.meta" />
    </ng-template>

    @if (expanded()) {
      <p-dialog
        [visible]="true"
        (visibleChange)="$event ? null : close()"
        [modal]="true"
        [dismissableMask]="false"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: '96vw', height: '94vh' }"
        [contentStyle]="{ overflow: 'auto' }"
      >
        <ng-template #header>
          <div class="csw-dialog-header">
            <span class="p-dialog-title">{{ clientName() ? 'Schedule: ' + clientName() : 'Schedule' }}</span>
            @if (schedule(); as s) {
              <div class="csw-dialog-actions">
                @if (s.seeAll()) {
                  <app-people-select
                    inputId="cswTeamMember"
                    [options]="s.teamMembers()"
                    [pickId]="s.teamMemberId()"
                    (pickIdChange)="s.teamMemberId.set($event)"
                    class="csw-team-member"
                    placeholder="Select team member"
                    filterPlaceholder="Search team…"
                    ariaLabel="Team member"
                  />
                }
                @if (s.canCreate()) {
                  <p-button label="Add visit" icon="pi pi-plus" (onClick)="s.openNew()" />
                }
              </div>
            }
          </div>
        </ng-template>
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
  /** The schedule in the overlay: its header controls (Team member, Add visit) drive it. */
  readonly schedule = viewChild(SchedulePage);

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
