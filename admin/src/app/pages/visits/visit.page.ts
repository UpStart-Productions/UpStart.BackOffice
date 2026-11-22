import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, OnDestroy, OnInit, output, signal, viewChild, type TemplateRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { CheckboxModule } from 'primeng/checkbox';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { formAnswerProblem, isContentField, isEmptyFormAnswer, type FormFieldDto, type VisitDetailDto, type VisitFormDto, type VisitLogFormDto } from '@upstart/back-office/shared';
import { ApiError } from '../../core/api.service';
import { AutoSaver } from '../../core/auto-saver';
import { ClientFormsApi } from '../../core/client-forms.api';
import { dateKey } from '../../core/date.util';
import { VisitsApi } from '../../core/visits.api';
import { FormFilesClient } from '../../core/form-files.client';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { AppQuillEditorComponent } from '../../ui/quill-editor/app-quill-editor.component';
import { PageComponent } from '../../ui/layout/page.component';
import { PersonCardComponent } from '../../ui/record-card/person-card.component';
import { SaveStatusComponent } from '../../ui/save-status/save-status.component';
import { TimeInputComponent } from '../../ui/time-input/time-input.component';
import { atLocal, formatDuration, timeKey } from '../../ui/visits/visit-time.util';

/**
 * The visit log: the team member, the actual time, notes (rich text) and the forms of its visit type. A start and end
 * finish it and add the time to the timesheet. Times and notes save as you go.
 */
@Component({
  selector: 'app-visit-page',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    MessageModule,
    TagModule,
    AppQuillEditorComponent,
    CheckboxModule,
    TabsModule,
    FormFieldInputComponent,
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
        @if (visit()?.canWork && !embedded()) {
          <app-save-status [state]="saver.state()" />
        }
    </ng-template>
    <ng-template #visitBody>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (visit(); as v) {
        <div class="visit-log" [class.card]="!embedded()">
          <div class="side-list">
            @if (v.teamMember; as m) {
              <app-person-card kind="user" [person]="m" subtitle="Team member" />
            } @else {
              <div class="side-list-row">
                <div class="side-list-body"><span class="side-list-title">Unassigned</span></div>
              </div>
            }
          </div>

          @if (embedded() && v.forms.length) {
            <p-tabs class="v-tabs" [value]="tab()" (valueChange)="setTab($event)">
              <p-tablist>
                <p-tab value="log">Log</p-tab>
                @for (f of v.forms; track f.formId) {
                  <p-tab [value]="f.formId">{{ f.formName }}</p-tab>
                }
              </p-tablist>
            </p-tabs>
          }

          @if (!embedded() || !openForm()) {
            <div class="visit-log-time">
              <div class="form-field v-date">
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
              @if (v.durationMin !== null) {
                <span class="v-duration">{{ duration(v.durationMin) }}</span>
              }
            </div>

            <app-quill-editor
              [(ngModel)]="notes"
              (ngModelChange)="notesChanged($event)"
              [readOnly]="!v.canWork"
              mentionToolbar="minimal"
              placeholder="Notes"
              aria-label="Notes"
              [styles]="{ 'min-height': '120px' }"
            />
          }

          @if (v.forms.length) {
            @if (embedded()) {
              @if (openForm(); as f) {
                    <div class="v-form">
                      <div class="v-form-head">
                        <span class="v-form-name">{{ f.formName }}</span>
                        @if (f.submittedAt) {
                          <p-tag value="Submitted" severity="success" />
                          @if (v.canWork) {
                            <button type="button" class="link-btn" [disabled]="reopening() === f.formId" (click)="reopenForm(f)">Reopen</button>
                          }
                        } @else {
                          @if (f.recordId) {
                            <p-tag value="In progress" severity="info" />
                          }
                        }
                                              </div>
                      @for (s of f.sections; track s.id) {
                        @if (f.sections.length > 1) {
                          <div class="v-form-section">{{ s.name }}</div>
                        }
                        <div class="showcase-row">
                          @for (q of s.fields; track q.id) {
                            <app-form-field-input
                              class="showcase-half"
                              [class.v-wide]="q.type === 'LONG_TEXT' || q.type === 'CONTENT' || q.type === 'GROUP'"
                              [field]="q"
                              [idPrefix]="f.formId + '-'"
                              [value]="answers[f.formId][q.id] ?? null"
                              (valueChange)="answerChanged(f.formId, q.id, $event)"
                              [disabled]="!v.canWork || !!f.submittedAt || v.status === 'CANCELLED'"
                              [error]="answerError(f, q)"
                              [fileUpload]="uploaders[f.formId] ?? null"
                              [fileOpen]="openers[f.formId] ?? null"
                            />
                          }
                        </div>
                      } @empty {
                        <p class="m-0 text-color-secondary">This form has no questions yet.</p>
                      }
                    </div>
              }
            } @else {
            <div>
              <div class="v-forms-label">Forms <app-help-text key="visit.forms" /></div>
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
                }
              </div>
            </div>
            }
          }
        </div>
      }
    </ng-template>
  `,
  styles: `
    .visit-log {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .visit-log > .side-list:first-child .side-list-row:first-child,
    .visit-log > .side-list:first-child ::ng-deep .side-list-row:first-child {
      padding-top: 0;
      padding-bottom: 0;
    }
    .v-tabs {
      margin-top: -0.5rem;
    }
    .visit-log-time {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 0.75rem;
    }
    .visit-log-time .form-field {
      margin: 0;
    }
    .v-date {
      width: 11rem;
    }
    .v-time {
      width: 9rem;
    }
    .v-duration {
      padding-bottom: 0.6rem;
      color: var(--p-text-muted-color);
    }
    .v-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .v-form-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .v-form-name {
      font-weight: 600;
      font-size: 1.05rem;
    }
    .v-form-section {
      font-weight: 600;
      color: var(--p-text-muted-color);
    }
    .v-wide {
      flex-basis: 100%;
    }
    .v-forms-label {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

  `,
})
export class VisitPage implements OnInit, OnDestroy {
  private readonly visitsApi = inject(VisitsApi);
  private readonly clientForms = inject(ClientFormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly formFiles = inject(FormFilesClient);

  /** In the visit modal: the visit to show (the page reads it from the address). */
  visitId = input<string | null>(null);
  /** In the visit modal: no page header; leaving (deleted, opened a form or the client) emits leave. */
  embedded = input(false);
  leave = output<void>();
  /** In the visit modal: the tab to open on ('log' or a form's id). */
  initialTab = input('log');
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
  private savedNotes = '';

  /** In the modal: saving (Save button). */
  saving = signal(false);
  /** In the modal: the times were changed (only then does Save send them, so saving notes doesn't finish a visit). */
  private timesDirty = false;
  /** Modal forms: answers on screen, the ones changed since loading and file upload/open per form. */
  answers: Record<string, Record<string, unknown>> = {};
  private changedAnswers: Record<string, Record<string, unknown>> = {};
  uploaders: Record<string, ReturnType<FormFilesClient['uploader']>> = {};
  openers: Record<string, ReturnType<FormFilesClient['opener']> | null> = {};
  reopening = signal<string | null>(null);
  /** Modal tabs: 'log' (times, notes) or a form's id (one tab per form of the visit type). */
  tab = signal<string>('log');
  readonly openForm = computed(() => this.visit()?.forms.find((f) => f.formId === this.tab()) ?? null);

  setTab(value: string | number | undefined) {
    this.tab.set(typeof value === 'string' ? value : 'log');
  }

  /** Format problems found on Save, by form then question (cleared when the answer changes). */
  formatErrors: Record<string, Record<string, string>> = {};
  /** Forms Save tried to submit with required questions empty: show Required under them. */
  private checkedRequired = new Set<string>();

  /** Shown under a question: its format problem, or Required on a form that's in progress or failed to submit. */
  answerError(f: VisitLogFormDto, q: FormFieldDto): string | null {
    const format = this.formatErrors[f.formId]?.[q.id];
    if (format) return format;
    const flag = (!!f.recordId && !f.submittedAt) || this.checkedRequired.has(f.formId);
    return flag && q.required && !isContentField(q) && isEmptyFormAnswer(this.answers[f.formId]?.[q.id]) ? 'Required' : null;
  }

  answerChanged(formId: string, fieldId: string, value: unknown) {
    this.answers[formId][fieldId] = value;
    if (this.formatErrors[formId]) delete this.formatErrors[formId][fieldId];
    (this.changedAnswers[formId] ??= {})[fieldId] = value ?? null;
  }

  /** Reopen a submitted form so its answers can change (right away; it isn't part of Save). */
  async reopenForm(f: VisitLogFormDto) {
    if (!f.recordId) return;
    this.reopening.set(f.formId);
    try {
      await this.clientForms.reopen(f.recordId);
      await this.reloadForms();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not reopen', detail: this.message(err) });
    } finally {
      this.reopening.set(null);
    }
  }

  /** Reload the visit's forms (record ids, submitted) and keep everything typed on screen. */
  private async reloadForms() {
    const fresh = await this.visitsApi.visit(this.id);
    const v = this.visit();
    this.visit.set(v ? { ...v, forms: fresh.forms } : fresh);
    this.setupForms(fresh.forms);
  }

  private setupForms(forms: VisitLogFormDto[]) {
    for (const f of forms) {
      this.answers[f.formId] = { ...f.values, ...(this.changedAnswers[f.formId] ?? {}) };
      this.uploaders[f.formId] = this.formFiles.uploader(f.formId);
      this.openers[f.formId] = f.recordId ? this.formFiles.opener(`/client-forms/records/${f.recordId}/files`) : null;
    }
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed';
  }

  /** Page: save notes on a real edit (Quill normalizes the value when it loads). Modal: Save sends them. */
  notesChanged(value: string | null) {
    const v = this.isBlank(value) ? '' : (value ?? '');
    if (this.embedded()) {
      this.notes = v;
      return;
    }
    if (!this.visit()?.canWork || v === this.savedNotes) return;
    this.savedNotes = v;
    this.notes = v;
    this.saver.change('notes', v);
  }

  private isBlank(html: string | null): boolean {
    return !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

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
    const start = this.initialTab();
    if (this.tab() === 'log' && v.forms.some((f) => f.formId === start)) this.tab.set(start);
    const startedAt = v.startedAt ? new Date(v.startedAt) : null;
    // Not worked yet: start from the planned times (saved only when changed).
    this.date = dateKey(startedAt ?? new Date(v.startAt));
    this.startTime = timeKey(startedAt ?? new Date(v.startAt));
    this.endTime = timeKey(new Date(v.endedAt ?? v.endAt));
    this.notes = v.notes ?? '';
    this.savedNotes = this.notes;
    this.setupForms(v.forms);
  }

  /**
   * Date, start or end changed: save once they make a full time. A visit that hasn't started needs both a start and
   * an end (logged afterwards: that finishes it); typing only a start doesn't start it.
   */
  timesChanged() {
    if (this.embedded()) {
      this.timesDirty = true;
      return;
    }
    const needsEnd = this.visit()?.status === 'SCHEDULED';
    if (this.date && this.startTime && (!needsEnd || this.endTime)) this.saver.change('times', true);
  }

  /** Modal Save: the notes, and the times if changed. False (with a message) if it couldn't save. */
  async save(): Promise<boolean> {
    const v = this.visit();
    if (!v?.canWork) return true;
    const body: { notes: string | null; startedAt?: string; endedAt?: string } = { notes: this.isBlank(this.notes) ? null : this.notes };
    // A visit whose planned end has passed and isn't done: Save logs the times on screen (the planned ones unless
    // changed), so it stops showing as Missed. Otherwise only changed times are sent.
    const pastDue = v.status !== 'COMPLETED' && new Date(v.endAt) <= new Date();
    if ((this.timesDirty || pastDue) && this.timesEditable()) {
      if (!this.date || !this.startTime || (v.status === 'SCHEDULED' && !this.endTime)) {
        this.toast.add({ severity: 'warn', summary: 'Add the date, start and end' });
        return false;
      }
      Object.assign(body, this.times());
    }
    if (!this.checkFormats()) return false;
    this.saving.set(true);
    try {
      await this.visitsApi.updateVisit(this.id, body);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save the visit', detail: this.message(err) });
      this.saving.set(false);
      return false;
    }
    try {
      return await this.saveForms(v.clientId);
    } finally {
      this.saving.set(false);
    }
  }

  /** Format problems in changed forms block Save: shown under the questions, on the first such form's tab. */
  private checkFormats(): boolean {
    this.formatErrors = {};
    let first: VisitLogFormDto | null = null;
    for (const f of this.visit()?.forms ?? []) {
      if (!this.changedAnswers[f.formId]) continue;
      for (const q of f.sections.flatMap((s) => s.fields)) {
        const problem = formAnswerProblem(q.type, this.answers[f.formId]?.[q.id]);
        if (!problem) continue;
        (this.formatErrors[f.formId] ??= {})[q.id] = problem;
        first ??= f;
      }
    }
    if (!first) return true;
    this.tab.set(first.formId);
    this.toast.add({ severity: 'warn', summary: 'Check the highlighted answers', detail: `${first.formName} has answers in the wrong format.` });
    return false;
  }

  /** Required questions of a form still empty. */
  private missingRequired(f: VisitLogFormDto): number {
    return f.sections.flatMap((s) => s.fields).filter((q) => q.required && !isContentField(q) && isEmptyFormAnswer(this.answers[f.formId]?.[q.id])).length;
  }

  /**
   * Each form with changed answers: made on first save, answers saved, then submitted if every required question is
   * answered (the server checks; otherwise it stays In progress).
   */
  private async saveForms(clientId: string): Promise<boolean> {
    for (const f of this.visit()?.forms ?? []) {
      const changed = this.changedAnswers[f.formId];
      if (!changed) continue;
      try {
        const id = f.recordId ?? (await this.clientForms.create(f.formId, clientId, this.id)).id;
        await this.clientForms.save(id, changed);
        delete this.changedAnswers[f.formId];
        if (!f.submittedAt) {
          const missing = this.missingRequired(f);
          if (missing) {
            // Saved, not submitted: it stays In progress until the required questions are answered.
            this.checkedRequired.add(f.formId);
            this.toast.add({
              severity: 'info',
              summary: `${f.formName} is in progress`,
              detail: `Saved. ${missing} required question${missing === 1 ? '' : 's'} to answer before it's submitted.`,
            });
          } else {
            try {
              await this.clientForms.submit(id);
            } catch (err) {
              // The server found something still missing: it stays In progress.
              if (!(err instanceof ApiError && err.status === 400)) throw err;
              this.toast.add({ severity: 'info', summary: `${f.formName} is in progress`, detail: this.message(err) });
            }
          }
        }
      } catch (err) {
        this.toast.add({ severity: 'error', summary: `Could not save ${f.formName}`, detail: this.message(err) });
        await this.reloadForms().catch(() => undefined);
        return false;
      }
    }
    return true;
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
