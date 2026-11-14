import { TimeInputComponent } from '../time-input/time-input.component';
import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { dateKey } from '../../core/date.util';
import { SessionService } from '../../core/session.service';
import { PeopleDirectoryOption, teamUsersToOptions } from '../../pages/projects/people-directory.util';
import { DateInputComponent } from '../date-input/date-input.component';
import { PeopleSelectComponent } from '../people-select/people-select.component';
import { atLocal, timeKey } from './care.types';

/**
 * Start a visit now or log a past one for a client (the client's Care tab). Opens the visit when saved;
 * a logged visit's time goes on the timesheet right away.
 */
@Component({
  selector: 'app-new-visit-dialog',
  standalone: true,
  imports: [TimeInputComponent, FormsModule, ButtonModule, InputTextModule, AppDialogModule, DateInputComponent, PeopleSelectComponent],
  template: `
    <p-dialog [header]="mode() === 'start' ? 'Start visit' : 'Log past visit'" [(visible)]="visible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      @if (mode() === 'start') {
        <p class="mt-0">Starts a visit for {{ clientName() }} now. End it from the visit's page.</p>
      } @else {
        @if (seeAll()) {
          <div class="form-field">
            <label for="nvWorker">Worker</label>
            <app-people-select inputId="nvWorker" [options]="workers()" [(pickId)]="workerId" placeholder="Me" filterPlaceholder="Search team…" ariaLabel="Worker" />
          </div>
        }
        <div class="form-field" [class.mt-3]="seeAll()">
          <label for="nvDate">Date</label>
          <app-date-input inputId="nvDate" [(ngModel)]="date" />
        </div>
        <div class="flex gap-2 mt-3">
          <div class="form-field flex-1">
            <label for="nvStart">Start</label>
            <app-time-input inputId="nvStart" [(ngModel)]="start" />
          </div>
          <div class="form-field flex-1">
            <label for="nvEnd">End</label>
            <app-time-input inputId="nvEnd" [(ngModel)]="end" [after]="start" [overnight]="true" />
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="visible.set(false)" />
        <p-button
          [label]="mode() === 'start' ? 'Start' : 'Log visit'"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="mode() === 'log' && (!date || !start || !end)"
          (onClick)="create()"
        />
      </ng-template>
    </p-dialog>
  `,
})
export class NewVisitDialogComponent {
  private readonly care = inject(CareApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  visible = model(false);
  mode = input<'start' | 'log'>('start');
  clientId = input.required<string>();
  clientName = input('');

  readonly seeAll = computed(() => this.session.me()?.role === 'ADMIN' || this.session.me()?.permissions?.visits === 'all');
  workers = signal<PeopleDirectoryOption[]>([]);
  saving = signal(false);
  workerId: string | null = null;
  date = '';
  start = '';
  end = '';
  private workersLoaded = false;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const now = new Date();
      this.workerId = null;
      this.date = dateKey(now);
      this.end = timeKey(now);
      this.start = timeKey(new Date(now.getTime() - 60 * 60000));
      if (this.mode() === 'log' && this.seeAll() && !this.workersLoaded) void this.loadWorkers();
    });
  }

  private async loadWorkers() {
    this.workersLoaded = true;
    try {
      this.workers.set(teamUsersToOptions(await this.care.workers()));
    } catch {
      this.workers.set([]);
    }
  }

  async create() {
    this.saving.set(true);
    try {
      let body: Parameters<CareApi['createVisit']>[0] = { clientId: this.clientId() };
      if (this.mode() === 'log') {
        const s = atLocal(this.date, this.start);
        let e = atLocal(this.date, this.end);
        if (e <= s) e = new Date(e.getTime() + 86_400_000); // past midnight
        body = { ...body, startedAt: s.toISOString(), endedAt: e.toISOString(), ...(this.workerId ? { userId: this.workerId } : {}) };
      }
      const visit = await this.care.createVisit(body);
      this.visible.set(false);
      await this.router.navigate(['/care/visits', visit.id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }
}
