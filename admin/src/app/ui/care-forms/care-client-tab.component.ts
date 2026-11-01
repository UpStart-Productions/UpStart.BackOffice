import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import {
  areaLevel,
  CARE_STATUS_LABELS,
  CARE_STATUSES,
  type CareClientFormDto,
  type CareClientOverviewDto,
  type CareShiftDto,
  type CareStatus,
  type CareVisitListItemDto,
} from '@upstart/back-office/shared';
import { CareApi } from '../../core/care.api';
import { SessionService } from '../../core/session.service';
import { formatDuration } from './care.types';

/** p-tag severity per care status. */
export const CARE_STATUS_SEVERITY: Record<CareStatus, 'success' | 'warn' | 'secondary'> = {
  ACTIVE: 'success',
  PAUSED: 'warn',
  ENDED: 'secondary',
};

/** How far ahead the Schedule card looks. */
const SCHEDULE_DAYS = 14;
/** Visits listed on the tab (View all opens Care → Visits for this client). */
const RECENT_VISITS = 10;

/**
 * A client's Care tab: status, summary, Intake form / Care profile, recent visits and upcoming shifts.
 * Each part shows only what the user's role allows (Care forms, Visits, Schedule).
 */
@Component({
  selector: 'app-care-client-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, SelectModule, TableModule, TagModule],
  template: `
    <div class="grid grid-3">
      <div class="stack span-2">
        @if (canVisits()) {
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Visits</h3>
              <div class="flex align-items-center gap-2">
                <a pButton label="View all" severity="secondary" [text]="true" size="small" routerLink="/care/visits" [queryParams]="{ clientId: clientId() }"></a>
                @if (canCreateVisit()) {
                  <a pButton label="Log past visit" icon="pi pi-history" severity="secondary" [outlined]="true" size="small" routerLink="/care/visits" [queryParams]="{ clientId: clientId(), new: 'log' }"></a>
                  <a pButton label="Start visit" icon="pi pi-play" size="small" routerLink="/care/visits" [queryParams]="{ clientId: clientId(), new: 'start' }"></a>
                }
              </div>
            </div>
            <p-table [value]="recentVisits()" [loading]="visitsLoading()" styleClass="table-bordered">
              <ng-template pTemplate="header">
                <tr>
                  <th>Date</th>
                  <th>Worker</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-v>
                <tr>
                  <td><a [routerLink]="['/care/visits', v.id]" class="text-primary">{{ v.startedAt | date: 'EEE, MMM d' }}</a></td>
                  <td>{{ v.worker.name }}</td>
                  <td>{{ v.startedAt | date: 'h:mm a' }}@if (v.endedAt) { – {{ v.endedAt | date: 'h:mm a' }}}</td>
                  <td>{{ duration(v.durationMin) }}</td>
                  <td>
                    @if (v.status === 'IN_PROGRESS') {
                      <p-tag value="In progress" severity="info" />
                    } @else {
                      <p-tag value="Done" severity="success" />
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="5">No visits yet.</td></tr>
              </ng-template>
            </p-table>
          </div>
        }

        @if (canSchedule()) {
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Schedule</h3>
              <div class="flex align-items-center gap-2">
                <a pButton label="View all" severity="secondary" [text]="true" size="small" routerLink="/care/schedule" [queryParams]="{ clientId: clientId() }"></a>
                @if (canCreateShift()) {
                  <a pButton label="Add shift" icon="pi pi-plus" size="small" routerLink="/care/schedule" [queryParams]="{ clientId: clientId(), new: 1 }"></a>
                }
              </div>
            </div>
            <p-table [value]="shifts()" [loading]="shiftsLoading()" styleClass="table-bordered">
              <ng-template pTemplate="header">
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Worker</th>
                  <th>Repeats</th>
                  <th>Status</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-s>
                <tr>
                  <td>{{ s.startAt | date: 'EEE, MMM d' }}</td>
                  <td>{{ s.startAt | date: 'h:mm a' }} – {{ s.endAt | date: 'h:mm a' }}</td>
                  <td>
                    @if (s.worker) {
                      {{ s.worker.name }}
                    } @else {
                      <p-tag value="Open" severity="warn" />
                    }
                  </td>
                  <td>{{ s.repeatLabel ?? '' }}</td>
                  <td>
                    @if (s.status === 'CANCELLED') {
                      <p-tag value="Cancelled" severity="secondary" />
                    } @else if (s.visitStatus === 'IN_PROGRESS') {
                      <p-tag value="In progress" severity="info" />
                    } @else if (s.visitStatus === 'COMPLETED') {
                      <p-tag value="Done" severity="success" />
                    } @else {
                      <p-tag value="Scheduled" severity="info" />
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template pTemplate="emptymessage">
                <tr><td colspan="5">No shifts in the next {{ scheduleDays }} days.</td></tr>
              </ng-template>
            </p-table>
          </div>
        }
      </div>

      <div class="stack span-1">
        <div class="card card--side">
          <div class="card-header"><h3 class="card-title">Care</h3></div>
          <div class="side-list">
            <div class="side-list-row">
              <div class="side-list-body"><span class="side-list-title">Status</span></div>
              @if (overview().canManage) {
                <p-select
                  inputId="careStatus"
                  [options]="statusOptions"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="overview().careStatus"
                  (ngModelChange)="setStatus($event)"
                  [disabled]="savingStatus()"
                  ariaLabel="Care status"
                />
              } @else if (overview().careStatus; as st) {
                <p-tag [value]="statusLabel[st]" [severity]="statusSeverity[st]" />
              }
            </div>
            @if (canSchedule()) {
              <div class="side-list-row">
                <div class="side-list-body">
                  <span class="side-list-title">Next shift</span>
                  @if (nextShift(); as s) {
                    <span class="side-list-detail">{{ s.worker?.name ?? 'Open shift' }}</span>
                  }
                </div>
                <span class="side-list-value">{{ nextShift() ? (nextShift()!.startAt | date: 'EEE, MMM d, h:mm a') : 'None' }}</span>
              </div>
            }
            @if (canVisits()) {
              <div class="side-list-row">
                <div class="side-list-body"><span class="side-list-title">Last visit</span></div>
                <span class="side-list-value">{{ lastVisit() ? (lastVisit()!.startedAt | date: 'EEE, MMM d') : 'None' }}</span>
              </div>
              <div class="side-list-row">
                <div class="side-list-body"><span class="side-list-title">Hours this month</span></div>
                <span class="side-list-value side-list-value--strong">{{ duration(monthMinutes()) || '0m' }}</span>
              </div>
            }
          </div>
        </div>

        @if (overview().forms.length) {
          <div class="card card--side">
            <div class="card-header"><h3 class="card-title">Forms</h3></div>
            <div class="side-list">
              @for (f of overview().forms; track f.formId) {
                <div class="side-list-row">
                  <div class="side-list-body">
                    @if (f.recordId) {
                      <a class="side-list-title" [routerLink]="['/care/records', f.recordId]">{{ f.name }}</a>
                      <span class="side-list-detail">Updated {{ f.updatedAt | date: 'MMM d, y' }}</span>
                    } @else {
                      <span class="side-list-title">{{ f.name }}</span>
                      <span class="side-list-detail">None yet</span>
                    }
                  </div>
                  @if (f.recordId) {
                    <a pButton label="Open" size="small" severity="secondary" [outlined]="true" [routerLink]="['/care/records', f.recordId]"></a>
                  } @else if (f.myAccess === 'edit') {
                    <p-button label="Start" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" [loading]="starting() === f.formId" (onClick)="start(f)" />
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class CareClientTabComponent {
  private readonly care = inject(CareApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  clientId = input.required<string>();
  overview = input.required<CareClientOverviewDto>();
  /** The status changed (null: taken out of care). */
  overviewChange = output<CareClientOverviewDto>();

  readonly duration = formatDuration;
  readonly scheduleDays = SCHEDULE_DAYS;
  readonly statusLabel = CARE_STATUS_LABELS;
  readonly statusSeverity = CARE_STATUS_SEVERITY;
  /** NOT_IN_CARE takes the client out of care (the select can't hold a null option). */
  readonly statusOptions: { value: CareStatus | 'NOT_IN_CARE'; label: string }[] = [
    ...CARE_STATUSES.map((value) => ({ value, label: CARE_STATUS_LABELS[value] })),
    { value: 'NOT_IN_CARE', label: 'Not in care' },
  ];

  readonly canVisits = computed(() => !!areaLevel(this.session.me(), 'visits'));
  readonly canSchedule = computed(() => !!areaLevel(this.session.me(), 'schedule'));
  readonly canCreateVisit = computed(() => this.session.can('visits', 'create'));
  readonly canCreateShift = computed(() => this.session.can('schedule', 'create'));

  visits = signal<CareVisitListItemDto[]>([]);
  visitsLoading = signal(false);
  shifts = signal<CareShiftDto[]>([]);
  shiftsLoading = signal(false);
  savingStatus = signal(false);
  starting = signal<string | null>(null);

  readonly recentVisits = computed(() => this.visits().slice(0, RECENT_VISITS));
  readonly lastVisit = computed(() => this.visits()[0] ?? null);
  readonly nextShift = computed(() => this.shifts().find((s) => s.status === 'SCHEDULED' && new Date(s.endAt) > new Date()) ?? null);
  readonly monthMinutes = computed(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return this.visits()
      .filter((v) => new Date(v.startedAt) >= monthStart)
      .reduce((sum, v) => sum + (v.durationMin ?? 0), 0);
  });

  constructor() {
    effect(() => {
      const id = this.clientId();
      if (this.canVisits()) void this.loadVisits(id);
      if (this.canSchedule()) void this.loadShifts(id);
    });
  }

  private async loadVisits(clientId: string) {
    this.visitsLoading.set(true);
    try {
      this.visits.set((await this.care.visits({ clientId })).items);
    } catch {
      this.visits.set([]);
    } finally {
      this.visitsLoading.set(false);
    }
  }

  private async loadShifts(clientId: string) {
    this.shiftsLoading.set(true);
    try {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from.getTime() + SCHEDULE_DAYS * 86_400_000);
      this.shifts.set(await this.care.shifts({ from: from.toISOString(), to: to.toISOString(), clientId }));
    } catch {
      this.shifts.set([]);
    } finally {
      this.shiftsLoading.set(false);
    }
  }

  async setStatus(choice: CareStatus | 'NOT_IN_CARE') {
    const status = choice === 'NOT_IN_CARE' ? null : choice;
    if (status === this.overview().careStatus) return;
    this.savingStatus.set(true);
    try {
      const next = await this.care.setCareStatus(this.clientId(), status);
      this.overviewChange.emit(next);
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: status ? `Care status is ${CARE_STATUS_LABELS[status]}.` : 'Not in care. Their care records, visits and shifts are kept.',
      });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.savingStatus.set(false);
    }
  }

  async start(f: CareClientFormDto) {
    this.starting.set(f.formId);
    try {
      const { id } = await this.care.createRecord(f.formId, this.clientId());
      await this.router.navigate(['/care/records', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.starting.set(null);
    }
  }
}
