import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { dateKey } from '../../core/date.util';
import { atLocal, formatDuration, normalizeValues, timeKey } from '../../ui/care-forms/care.types';
import { FormFieldInputComponent } from '../../ui/care-forms/form-field-input.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/** One visit: when, notes and the visit log checklist. End it to record the time. */
@Component({
  selector: 'app-care-visit-page',
  standalone: true,
  imports: [
    DatePipe,
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
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="title()" backLink="/care/visits" backLabel="Back to Visits" helpKey="care.visit.page">
      <ng-container ngProjectAs="[pageMeta]">
        @if (visit(); as v) {
          @if (v.status === 'IN_PROGRESS') {
            <p-tag value="In progress" severity="info" />
          }
          @if (v.invoiced) {
            <p-tag value="Invoiced" severity="secondary" />
          }
          <a [routerLink]="['/organizations', v.clientId]" class="text-primary">Open organization</a>
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (visit(); as v) {
          @if (v.canEdit) {
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Visit actions" />
            @if (v.status === 'IN_PROGRESS') {
              <p-button label="Save" icon="pi pi-check" severity="secondary" [outlined]="true" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
              <p-button label="End visit" icon="pi pi-stop-circle" [loading]="ending()" (onClick)="end()" />
            } @else {
              <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
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
                  <app-date-input inputId="cvDate" [(ngModel)]="date" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field cv-time">
                  <label for="cvStart">Start</label>
                  <input pInputText id="cvStart" type="time" class="w-full" [(ngModel)]="start" [disabled]="!timesEditable()" />
                </div>
                <div class="form-field cv-time">
                  <label for="cvEnd">End</label>
                  @if (v.status === 'IN_PROGRESS') {
                    <input pInputText id="cvEnd" class="w-full" value="In progress" disabled />
                  } @else {
                    <input pInputText id="cvEnd" type="time" class="w-full" [(ngModel)]="endTime" [disabled]="!timesEditable()" />
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
                      [class.cv-wide]="f.type === 'LONG_TEXT'"
                      [field]="f"
                      [value]="values[f.id] ?? null"
                      (valueChange)="values[f.id] = $event"
                      [disabled]="!v.canEdit"
                    />
                  }
                </div>
              </div>
            }

            <div class="card">
              <div class="form-field">
                <label for="cvNotes">Notes</label>
                <textarea pTextarea id="cvNotes" class="w-full" rows="4" [autoResize]="true" [(ngModel)]="notes" [disabled]="!v.canEdit"></textarea>
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
export class CareVisitPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  visit = signal<CareVisitDto | null>(null);
  error = signal<string | null>(null);
  saving = signal(false);
  ending = signal(false);

  date = '';
  start = '';
  endTime = '';
  notes = '';
  values: Record<string, unknown> = {};
  private saved = '';

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
    this.saved = this.snapshot();
  }

  private snapshot() {
    return JSON.stringify({ d: this.date, s: this.start, e: this.endTime, n: this.notes.trim(), v: normalizeValues(this.values) });
  }

  isDirty() {
    return this.snapshot() !== this.saved;
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

  async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      const body = { ...(this.timesEditable() ? this.times() : {}), notes: this.notes.trim() || null, values: this.allValues() };
      this.apply(await this.care.updateVisit(this.id, body));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Visit saved.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async end() {
    this.ending.set(true);
    this.error.set(null);
    try {
      // A changed start time is saved first, then the visit ends now.
      if (this.timesEditable() && this.start !== timeKey(new Date(this.visit()!.startedAt))) {
        await this.care.updateVisit(this.id, { startedAt: this.times().startedAt });
      }
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
          await this.router.navigate(['/care/visits']);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }
}
