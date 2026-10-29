import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import type { CareVisitListItemDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { dateKey } from '../../core/date.util';
import { defaultPeriod, resolveReportPeriod } from '../../core/period.util';
import { SessionService } from '../../core/session.service';
import { atLocal, formatDuration, timeKey } from '../../ui/care-forms/care.types';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { PeriodPickerComponent } from '../../ui/period-picker/period-picker.component';
import { PeopleDirectoryOption, teamUsersToOptions } from '../projects/people-directory.util';

/** Care → Visits: who visited whom and when, with the visit log. Start a visit now or log one afterwards. */
@Component({
  selector: 'app-care-visits-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    AppDialogModule,
    DateInputComponent,
    OrganizationSelectComponent,
    PageComponent,
    PeopleSelectComponent,
    PeriodPickerComponent,
  ],
  template: `
    <app-page title="Visits" helpKey="care.visits.page">
      <ng-container ngProjectAs="[pageActions]">
        @if (canSetup() && formId()) {
          <a pButton label="Customize fields" icon="pi pi-sliders-h" severity="secondary" [outlined]="true" [routerLink]="['/care/forms', formId()]"></a>
        }
        @if (canCreate()) {
          <p-button label="Log past visit" icon="pi pi-history" severity="secondary" [outlined]="true" (onClick)="openNew('log')" />
          <p-button label="Start visit" icon="pi pi-play" [disabled]="!!inProgress()" (onClick)="openNew('start')" />
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (inProgress(); as v) {
        <div class="card visit-running">
          <i class="pi pi-clock visit-running-icon" aria-hidden="true"></i>
          <span class="flex-1">Visit in progress at <strong>{{ v.clientName }}</strong> since {{ v.startedAt | date: 'h:mm a' }}</span>
          <a pButton label="Open" icon="pi pi-arrow-right" iconPos="right" size="small" severity="secondary" [routerLink]="['/care/visits', v.id]"></a>
        </div>
      }

      <div class="card">
        <div class="visit-filters">
          <app-period-picker idPrefix="visitsPeriod" [(value)]="period" />
          @if (seeAll()) {
            <div class="form-field visit-filter-field">
              <label for="visitsWorker">Worker</label>
              <app-people-select inputId="visitsWorker" [options]="workers()" [(pickId)]="workerId" placeholder="Everyone" filterPlaceholder="Search team…" ariaLabel="Worker" />
            </div>
          }
          <div class="form-field visit-filter-field">
            <label for="visitsOrg">Organization</label>
            <app-organization-select inputId="visitsOrg" [(value)]="clientId" />
          </div>
        </div>
        <p-table [value]="items()" [loading]="loading()" styleClass="table-bordered" [paginator]="items().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th>Date</th>
              <th>Organization</th>
              @if (seeAll()) { <th>Worker</th> }
              <th>Time</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-v>
            <tr>
              <td><a [routerLink]="['/care/visits', v.id]" class="text-primary">{{ v.startedAt | date: 'EEE, MMM d' }}</a></td>
              <td>{{ v.clientName }}</td>
              @if (seeAll()) { <td>{{ v.worker.name }}</td> }
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
            <tr><td [attr.colspan]="seeAll() ? 6 : 5">No visits in this period.</td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog [header]="newMode === 'start' ? 'Start visit' : 'Log past visit'" [(visible)]="newVisible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
        <div class="form-field">
          <label for="nvOrg">Organization</label>
          <app-organization-select inputId="nvOrg" [(value)]="newClientId" />
        </div>
        @if (newMode === 'log') {
          @if (seeAll()) {
            <div class="form-field mt-3">
              <label for="nvWorker">Worker</label>
              <app-people-select inputId="nvWorker" [options]="workers()" [(pickId)]="newWorkerId" placeholder="Me" filterPlaceholder="Search team…" ariaLabel="Worker" />
            </div>
          }
          <div class="form-field mt-3">
            <label for="nvDate">Date</label>
            <app-date-input inputId="nvDate" [(ngModel)]="newDate" />
          </div>
          <div class="flex gap-2 mt-3">
            <div class="form-field flex-1">
              <label for="nvStart">Start</label>
              <input pInputText id="nvStart" type="time" class="w-full" [(ngModel)]="newStart" />
            </div>
            <div class="form-field flex-1">
              <label for="nvEnd">End</label>
              <input pInputText id="nvEnd" type="time" class="w-full" [(ngModel)]="newEnd" />
            </div>
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="creating()" (onClick)="newVisible = false" />
          <p-button
            [label]="newMode === 'start' ? 'Start' : 'Log visit'"
            icon="pi pi-check"
            [loading]="creating()"
            [disabled]="!newClientId || (newMode === 'log' && (!newDate || !newStart || !newEnd))"
            (onClick)="create()"
          />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `
    .visit-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .visit-filter-field {
      width: 14rem;
      max-width: 100%;
    }
    .visit-running {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--color-severity-info-bg);
    }
    .visit-running-icon {
      color: var(--color-severity-info-text);
    }
  `,
})
export class CareVisitsPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  items = signal<CareVisitListItemDto[]>([]);
  inProgress = signal<CareVisitListItemDto | null>(null);
  workers = signal<PeopleDirectoryOption[]>([]);
  formId = signal<string | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  creating = signal(false);

  period = signal(defaultPeriod());
  workerId = signal<string | null>(null);
  clientId = signal<string | null>(null);

  readonly seeAll = computed(() => this.session.me()?.role === 'ADMIN' || this.session.me()?.permissions?.visits === 'all');
  readonly canCreate = computed(() => this.session.can('visits', 'create'));
  readonly canSetup = computed(() => this.session.can('care', 'setup'));

  newVisible = false;
  newMode: 'start' | 'log' = 'start';
  newClientId: string | null = null;
  newWorkerId: string | null = null;
  newDate = '';
  newStart = '';
  newEnd = '';

  readonly duration = formatDuration;

  constructor() {
    effect(() => {
      this.period();
      this.workerId();
      this.clientId();
      void this.load();
    });
  }

  async ngOnInit() {
    if (this.canSetup()) {
      this.care.visitForm().then((r) => this.formId.set(r.formId), () => undefined);
    }
    if (this.seeAll()) {
      try {
        this.workers.set(teamUsersToOptions(await this.care.workers()));
      } catch {
        this.workers.set([]);
      }
    }
  }

  async load() {
    const bounds = resolveReportPeriod(this.period());
    if (!bounds) return;
    this.loading.set(true);
    try {
      const res = await this.care.visits({
        from: bounds.from.toISOString(),
        to: bounds.to.toISOString(),
        userId: this.workerId(),
        clientId: this.clientId(),
      });
      this.items.set(res.items);
      this.inProgress.set(res.inProgress);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load visits');
    } finally {
      this.loading.set(false);
    }
  }

  openNew(mode: 'start' | 'log') {
    this.newMode = mode;
    this.newClientId = this.clientId();
    this.newWorkerId = null;
    const now = new Date();
    this.newDate = dateKey(now);
    this.newEnd = timeKey(now);
    this.newStart = timeKey(new Date(now.getTime() - 60 * 60000));
    this.newVisible = true;
  }

  async create() {
    if (!this.newClientId) return;
    this.creating.set(true);
    try {
      let body: Parameters<CareApi['createVisit']>[0] = { clientId: this.newClientId };
      if (this.newMode === 'log') {
        const start = atLocal(this.newDate, this.newStart);
        let end = atLocal(this.newDate, this.newEnd);
        if (end <= start) end = new Date(end.getTime() + 86_400_000); // past midnight
        body = { ...body, startedAt: start.toISOString(), endedAt: end.toISOString(), ...(this.newWorkerId ? { userId: this.newWorkerId } : {}) };
      }
      const visit = await this.care.createVisit(body);
      this.newVisible = false;
      await this.router.navigate(['/care/visits', visit.id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.creating.set(false);
    }
  }
}
