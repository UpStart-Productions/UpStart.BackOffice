import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, OnDestroy, OnInit, output, signal, viewChild, type TemplateRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import type { VisitDetailDto, VisitFormDto } from '@upstart/back-office/shared';
import { AutoSaver } from '../../core/auto-saver';
import { ClientFormsApi } from '../../core/client-forms.api';
import { dateKey } from '../../core/date.util';
import { VisitsApi } from '../../core/visits.api';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { PersonCardComponent } from '../../ui/record-card/person-card.component';
import { SaveStatusComponent } from '../../ui/save-status/save-status.component';
import { TimeInputComponent } from '../../ui/time-input/time-input.component';
import { atLocal, formatDuration, timeKey } from '../../ui/visits/visit-time.util';

/**
 * One visit: who, when (planned and actual), the forms of its visit type and notes. The team member starts and
 * finishes it; finishing adds the time to the timesheet. Actual times and notes save as you go.
 */
@Component({
  selector: 'app-visit-page',
  standalone: true,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    MessageModule,
    TagModule,
    TextareaModule,
    DateInputComponent,
    HelpTextComponent,
    PageComponent,
    PersonCardComponent,
    SaveStatusComponent,
    TimeInputComponent,
  ],
  template: `
    <!-- Embedded: in the visit modal, whose header shows the title, status (visitMeta) and actions (visitActions).
         Otherwise the /visits/:id page. -->
    @if (embedded()) {
      <ng-container *ngTemplateOutlet="visitBody" />
    } @else {
      <app-page [title]="title()" backLink="/schedule" backLabel="Back to Schedule" helpKey="visit.page">
        <ng-container ngProjectAs="[pageMeta]"><ng-container *ngTemplateOutlet="visitMeta" /></ng-container>
        <ng-container ngProjectAs="[pageActions]"><ng-container *ngTemplateOutlet="visitActions" /></ng-container>
        <ng-container *ngTemplateOutlet="visitBody" />
      </app-page>
    }

    <ng-template #visitMeta>
        @if (visit(); as v) {
          @switch (v.status) {
            @case ('IN_PROGRESS') { <p-tag value="In progress" severity="info" /> }
            @case ('COMPLETED') { <p-tag value="Done" severity="success" /> }
            @case ('CANCELLED') { <p-tag value="Cancelled" severity="secondary" /> }
          }
          @if (v.invoiced) {
            <p-tag value="Invoiced" severity="secondary" />
          }
          @if (!embedded()) {
            <a [routerLink]="['/accounts', v.clientId]" class="text-primary">Open client</a>
          }
        }
    </ng-template>
    <ng-template #visitActions>
        @if (visit()?.canWork) {
          <app-save-status [state]="saver.state()" />
        }
    </ng-template>
    <ng-template #visitBody>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (visit(); as v) {
        <div class="grid grid-3">
          <div class="stack span-2">
            <div class="card">
              <div class="card-header"><h2 class="card-title">Forms <app-help-text key="visit.forms" /></h2></div>
              <div class="side-list">
                @for (f of v.forms; track f.formId) {
                  <div class="side-list-row">
                    <div class="side-list-body">
                      @if (f.recordId) {
                        <a class="side-list-title" [routerLink]="['/forms/results', f.recordId]">{{ f.formName }}</a>
                      } @else {
                        <span class="side-list-title">{{ f.formName }}</span>
                      }
                    </div>
                    @if (f.submittedAt) {
                      <p-tag value="Submitted" severity="success" />
                    } @else if (f.recordId) {
                      <p-tag value="In progress" severity="info" />
                    } @else if (v.canWork && v.status !== 'CANCELLED') {
                      <p-button label="Fill in" icon="pi pi-pencil" size="small" severity="secondary" [loading]="openingForm() === f.formId" (onClick)="fillIn(f)" />
                    }
                  </div>
                } @empty {
                  <p class="side-list-empty m-0">No forms for {{ v.visitType.name }}. Attach one in Forms.</p>
                }
              </div>
            </div>

            <div class="card">
              <div class="card-header"><h2 class="card-title">Actual time <app-help-text key="visit.time" /></h2></div>
              <div class="showcase-row">
                <div class="form-field showcase-half">
                  <label for="vDate">Date</label>
                  <app-date-input inputId="vDate" [(ngModel)]="date" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field v-time">
                  <label for="vStart">Start</label>
                  <app-time-input inputId="vStart" [(ngModel)]="startTime" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field v-time">
                  <label for="vEnd">End</label>
                  <app-time-input inputId="vEnd" [after]="startTime" [overnight]="true" [(ngModel)]="endTime" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                </div>
              </div>
              @if (v.durationMin !== null) {
                <p class="mb-0 mt-3">{{ duration(v.durationMin) }}, added to the timesheet.</p>
              }
            </div>

            <div class="card">
              <div class="form-field">
                <label for="vNotes">Notes</label>
                <textarea pTextarea id="vNotes" class="w-full" rows="4" [autoResize]="true" [(ngModel)]="notes" (ngModelChange)="saver.change('notes', $event)" [disabled]="!v.canWork"></textarea>
              </div>
            </div>
          </div>

          <div class="side-panel-stack span-1">
            <div class="card card--side">
              <div class="side-list">
                @if (v.teamMember; as m) {
                  <app-person-card kind="user" [person]="m" subtitle="Team member" />
                } @else {
                  <div class="side-list-row">
                    <div class="side-list-body"><span class="side-list-title">Team member</span></div>
                    <span class="side-list-value">Unassigned</span>
                  </div>
                }
                <div class="side-list-row">
                  <div class="side-list-body">
                    <span class="side-list-title">Planned</span>
                    @if (v.repeatLabel) {
                      <span class="side-list-detail">{{ v.repeatLabel }}</span>
                    }
                  </div>
                  <span class="side-list-value">{{ v.startAt | date: 'EEE, MMM d, h:mm a' }} – {{ v.endAt | date: 'h:mm a' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </ng-template>
  `,
  styles: `
    .v-time {
      width: 9rem;
    }

  `,
})
export class VisitPage implements OnInit, OnDestroy {
  private readonly visitsApi = inject(VisitsApi);
  private readonly clientForms = inject(ClientFormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  /** In the visit modal: the visit to show (the page reads it from the address). */
  visitId = input<string | null>(null);
  /** In the visit modal: no page header; leaving (deleted, opened a form or the client) emits leave. */
  embedded = input(false);
  leave = output<void>();
  /** The status tags and the action buttons, for the visit modal's header. */
  readonly metaTemplate = viewChild<TemplateRef<unknown>>('visitMeta');
  readonly actionsTemplate = viewChild<TemplateRef<unknown>>('visitActions');
  private get id(): string {
    return this.visitId() ?? this.route.snapshot.paramMap.get('id') ?? '';
  }

  visit = signal<VisitDetailDto | null>(null);
  error = signal<string | null>(null);
  openingForm = signal<string | null>(null);

  /** Auto-save: notes, and the actual times once they make a full time. */
  readonly saver = new AutoSaver<unknown>(async (changes) => {
    const body = {
      ...('times' in changes && this.timesEditable() && this.date && this.startTime ? this.times() : {}),
      ...('notes' in changes ? { notes: this.notes.trim() || null } : {}),
    };
    await this.visitsApi.updateVisit(this.id, body);
    // Take the server's status, duration and lock state; keep what's typed on screen.
    this.visit.set(await this.visitsApi.visit(this.id));
  });

  date = '';
  startTime = '';
  endTime = '';
  notes = '';

  readonly duration = formatDuration;
  /** "Caregiver visit log for Alliance Services on Mon, Nov 16, 7:00 AM" (the planned start). */
  readonly title = computed(() => {
    const v = this.visit();
    return v ? `${v.visitType.name} visit log for ${v.clientName} on ${this.whenLabel()}` : 'Visit log';
  });
  readonly whenLabel = computed(() => {
    const v = this.visit();
    return v ? new Date(v.startAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  });
  readonly timesEditable = computed(() => !!this.visit()?.canWork && !this.visit()?.invoiced && this.visit()?.status !== 'CANCELLED');

  async ngOnInit() {
    try {
      this.apply(await this.visitsApi.visit(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  ngOnDestroy() {
    void this.saver.flush().catch(() => undefined);
    this.saver.destroy();
  }

  private apply(v: VisitDetailDto) {
    this.visit.set(v);
    const startedAt = v.startedAt ? new Date(v.startedAt) : null;
    // Not worked yet: start from the planned times (saved only when changed).
    this.date = dateKey(startedAt ?? new Date(v.startAt));
    this.startTime = timeKey(startedAt ?? new Date(v.startAt));
    this.endTime = timeKey(new Date(v.endedAt ?? v.endAt));
    this.notes = v.notes ?? '';
  }

  /**
   * Date, start or end changed: save once they make a full time. A visit that hasn't started needs both a start and
   * an end (logged afterwards: that finishes it); typing only a start doesn't start it.
   */
  timesChanged() {
    const needsEnd = this.visit()?.status === 'SCHEDULED';
    if (this.date && this.startTime && (!needsEnd || this.endTime)) this.saver.change('times', true);
  }

  private times(): { startedAt: string; endedAt?: string } {
    const startedAt = atLocal(this.date, this.startTime);
    if (!this.endTime) return { startedAt: startedAt.toISOString() };
    let endedAt = atLocal(this.date, this.endTime);
    if (endedAt <= startedAt) endedAt = new Date(endedAt.getTime() + 86_400_000); // past midnight
    return { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() };
  }

  /** Open the visit's copy of a form (made the first time), to fill in and submit. */
  async fillIn(f: VisitFormDto) {
    const v = this.visit();
    if (!v) return;
    this.openingForm.set(f.formId);
    try {
      const { id } = await this.clientForms.create(f.formId, v.clientId, v.id);
      this.leave.emit();
      await this.router.navigate(['/forms/results', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not open the form', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.openingForm.set(null);
    }
  }
}
