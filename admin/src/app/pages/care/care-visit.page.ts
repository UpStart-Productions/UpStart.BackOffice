import { TimeInputComponent } from '../../ui/time-input/time-input.component';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import type { CareVisitDto } from '@upstart/back-office/shared';
import { CareApi } from '../../core/care.api';
import { FormFilesClient } from '../../core/form-files.client';
import { AutoSaver } from '../../core/auto-saver';
import { SaveStatusComponent } from '../../ui/save-status/save-status.component';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { dateKey } from '../../core/date.util';
import { atLocal, formatDuration, timeKey } from '../../ui/care-forms/care.types';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/** One visit: when, notes and the visit log checklist. End it to record the time. */
@Component({
  selector: 'app-care-visit-page',
  standalone: true,
  imports: [
    TimeInputComponent,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TagModule,
    TextareaModule,
    DateInputComponent,
    FormFieldInputComponent,
    HelpTextComponent,
    PageComponent,
    SaveStatusComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="title()" [backLink]="backLink()" backLabel="Back to client" helpKey="care.visit.page">
      <ng-container ngProjectAs="[pageMeta]">
        @if (visit(); as v) {
          @if (v.status === 'IN_PROGRESS') {
            <p-tag value="In progress" severity="info" />
          }
          @if (v.invoiced) {
            <p-tag value="Invoiced" severity="secondary" />
          }
          <a [routerLink]="['/accounts', v.clientId]" [queryParams]="{ tab: 'care' }" class="text-primary">Open client</a>
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (visit(); as v) {
          @if (v.canEdit) {
            <app-save-status [state]="saver.state()" />
            @if (v.status === 'IN_PROGRESS') {
              <span class="split-action">
                <p-button label="End visit" icon="pi pi-stop-circle" [loading]="ending()" (onClick)="end()" />
                <app-row-actions-menu class="split-action-more" [attached]="true" [items]="headerActions()" ariaLabel="More visit actions" />
              </span>
            } @else {
              <app-row-actions-menu [items]="headerActions()" ariaLabel="Visit actions" />
            }
          }
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (visit(); as v) {
        <div class="grid grid-3">
          <div class="stack span-2">
            <div class="card">
              <div class="card-header"><h3 class="card-title">When <app-help-text key="care.visit.time" /></h3></div>
              <div class="showcase-row">
                <div class="form-field showcase-half">
                  <label for="cvDate">Date</label>
                  <app-date-input inputId="cvDate" [(ngModel)]="date" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field cv-time">
                  <label for="cvStart">Start</label>
                  <app-time-input inputId="cvStart" [(ngModel)]="start" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field cv-time">
                  <label for="cvEnd">End</label>
                  @if (v.status === 'IN_PROGRESS') {
                    <input pInputText id="cvEnd" class="w-full" value="In progress" disabled />
                  } @else {
                    <app-time-input inputId="cvEnd" [after]="start" [overnight]="true" [(ngModel)]="endTime" (ngModelChange)="timesChanged()" [disabled]="!timesEditable()" />
                  }
                </div>
              </div>
              <p class="mb-0 mt-3">{{ v.worker.name }}@if (v.durationMin !== null) {, {{ duration(v.durationMin) }}}</p>
            </div>

            @for (s of v.sections; track s.id) {
              <div class="card">
                <div class="card-header"><h3 class="card-title">{{ s.name }}</h3></div>
                <div class="showcase-row">
                  @for (f of s.fields; track f.id) {
                    <app-form-field-input
                      class="showcase-half"
                      [class.cv-wide]="f.type === 'LONG_TEXT' || f.type === 'CONTENT' || f.type === 'GROUP'"
                      [field]="f"
                      [value]="values[f.id] ?? null"
                      (valueChange)="onChange(f, $event)"
                      [disabled]="!v.canEdit"
                      [fileUpload]="fileUpload()"
                      [fileOpen]="fileOpen()"
                    />
                  }
                </div>
              </div>
            }

            <div class="card">
              <div class="form-field">
                <label for="cvNotes">Notes</label>
                <textarea pTextarea id="cvNotes" class="w-full" rows="4" [autoResize]="true" [(ngModel)]="notes" (ngModelChange)="saver.change('notes', $event)" [disabled]="!v.canEdit"></textarea>
              </div>
            </div>
          </div>
        </div>
      }
    </app-page>
  `,
  styles: `
    .cv-time {
      width: 9rem;
    }
    .cv-wide {
      flex-basis: 100%;
    }
  `,
})
export class CareVisitPage implements OnInit, OnDestroy {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);
  private readonly formFiles = inject(FormFilesClient);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  visit = signal<CareVisitDto | null>(null);
  /** File questions on the visit checklist: upload to the checklist form, download through this visit. */
  readonly fileUpload = computed(() => (this.visit()?.formId ? this.formFiles.uploader(this.visit()!.formId!) : null));
  readonly fileOpen = computed(() => (this.visit() ? this.formFiles.opener(`/care/visits/${this.visit()!.id}/files`) : null));
  /** Back to the client (there is no separate visits list). */
  readonly backLink = computed(() => (this.visit() ? ['/accounts', this.visit()!.clientId] : '/clients'));
  error = signal<string | null>(null);
  ending = signal(false);

  /** Auto-save: changed checklist answers (v:<field id>), notes, and the times (when they're complete). */
  readonly saver = new AutoSaver<unknown>(async (changes) => {
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) if (k.startsWith('v:')) values[k.slice(2)] = v;
    const body = {
      ...('times' in changes && this.timesEditable() && this.date && this.start ? this.times() : {}),
      ...('notes' in changes ? { notes: this.notes.trim() || null } : {}),
      ...(Object.keys(values).length ? { values } : {}),
    };
    const v = await this.care.updateVisit(this.id, body);
    // Keep what's on screen; take the server's times, duration and lock state.
    this.visit.set(v);
  });

  date = '';
  start = '';
  endTime = '';
  notes = '';
  values: Record<string, unknown> = {};

  readonly duration = formatDuration;
  title = computed(() => (this.visit() ? `Visit: ${this.visit()!.clientName}` : 'Visit'));
  timesEditable = computed(() => !!this.visit()?.canEdit && !this.visit()?.invoiced);

  async ngOnInit() {
    try {
      this.apply(await this.care.visit(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  private apply(v: CareVisitDto) {
    this.visit.set(v);
    const startedAt = new Date(v.startedAt);
    this.date = dateKey(startedAt);
    this.start = timeKey(startedAt);
    this.endTime = v.endedAt ? timeKey(new Date(v.endedAt)) : '';
    this.notes = v.notes ?? '';
    this.values = { ...v.values };
  }

  ngOnDestroy() {
    void this.saver.flush().catch(() => undefined);
    this.saver.destroy();
  }

  /** A checklist answer changed: save it (picks right away; typing a moment after it stops). */
  onChange(f: { id: string; type: string }, value: unknown) {
    this.values[f.id] = value;
    const typing = f.type === 'TEXT' || f.type === 'LONG_TEXT' || f.type === 'NUMBER' || f.type === 'GROUP';
    this.saver.change(`v:${f.id}`, value ?? null, !typing);
  }

  /** Date, start or end changed: save once they make a full time. */
  timesChanged() {
    if (this.date && this.start) this.saver.change('times', true);
  }

  private allValues() {
    const out: Record<string, unknown> = {};
    for (const s of this.visit()?.sections ?? []) for (const f of s.fields) out[f.id] = this.values[f.id] ?? null;
    return out;
  }

  private times(): { startedAt: string; endedAt?: string } {
    const startedAt = atLocal(this.date, this.start);
    if (!this.endTime) return { startedAt: startedAt.toISOString() };
    let endedAt = atLocal(this.date, this.endTime);
    if (endedAt <= startedAt) endedAt = new Date(endedAt.getTime() + 86_400_000); // past midnight
    return { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() };
  }

  headerActions(): RowActionItem[] {
    return [{ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', disabled: !!this.visit()?.invoiced, command: () => this.confirmDelete() }];
  }

  async end() {
    this.ending.set(true);
    this.error.set(null);
    try {
      // Everything typed so far is saved first, then the visit ends now.
      await this.saver.flush();
      this.apply(await this.care.endVisit(this.id, { notes: this.notes.trim() || null, values: this.allValues() }));
      this.toast.add({ severity: 'success', summary: 'Visit ended', detail: 'Its time was added to the timesheet.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Could not end the visit');
    } finally {
      this.ending.set(false);
    }
  }

  confirmDelete() {
    const v = this.visit();
    if (!v) return;
    this.confirm.confirm({
      message: `Delete this visit to ${v.clientName}? Its time entry is deleted too. This cannot be undone.`,
      accept: async () => {
        try {
          await this.care.deleteVisit(v.id);
          await this.router.navigate(['/accounts', v.clientId], { queryParams: { tab: 'care' } });
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }
}
