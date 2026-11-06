import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CommunicationsApi, NextStep, TeamMember } from '../../core/communications.api';
import { dateKey, parseDateKey } from '../../core/date.util';
import { NextActionOptionsLoader } from '../../core/next-action-options.loader';
import { CreatableSelectComponent } from '../creatable-select/creatable-select.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { PersonComponent } from '../person/person.component';

type OwnerOption = { id: string; label: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };

/**
 * One-line next step for an organization: what happens next, when, and who owns it.
 * Done records "Done: …" on the timeline, clears the step and opens the editor for the next one.
 * Used in the organization page's right-hand panel and on the Activity page.
 *
 * When `showInlineStatus` is false, overdue / due-today tags are omitted here — use `headerStatus` in the card header instead (e.g. Activity → Next action).
 */
@Component({
  selector: 'app-next-step',
  standalone: true,
  imports: [
    FormsModule,
    AppDialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TagModule,
    CreatableSelectComponent,
    HelpTextComponent,
    DateInputComponent,
    PersonComponent,
  ],
  template: `
    <div
      class="next-step"
      [class.next-step--panel-root]="variant() === 'panel'"
      [class.next-step--line]="variant() === 'line'"
      [class.next-step--overdue]="variant() === 'line' && step()?.overdue"
    >
      @if (variant() === 'panel') {
        @if (step()?.text; as text) {
          <div class="next-step-panel">
            <div class="next-step-panel-top">
              <div class="next-step-panel-owner">
                @if (step()?.owner; as o) {
                  <app-person
                    [firstName]="o.firstName"
                    [lastName]="o.lastName"
                    [name]="o.name"
                    [email]="o.email"
                    [avatarUrl]="o.avatarUrl"
                    [personId]="o.id"
                    [size]="28"
                  />
                }
              </div>
              @if (step()?.date) {
                <span
                  class="next-step-panel-date"
                  [class.next-step-panel-date--overdue]="step()?.overdue"
                  >{{ dateLabel() }}</span
                >
              }
            </div>
            <div class="next-step-panel-body">
              <span class="next-step-text">{{ text }}</span>
              <div class="next-step-panel-actions">
                @if (showInlineStatus()) {
                  @if (step()?.overdue) {
                    <p-tag value="Overdue" severity="danger" />
                  } @else if (dueToday()) {
                    <p-tag value="Due today" severity="warn" />
                  }
                }
                @if (canEdit()) {
                  <span class="next-step-actions">
                    <p-button label="Edit" severity="secondary" [text]="true" size="small" (onClick)="openEdit()" />
                    <p-button label="Done" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="done()" />
                  </span>
                }
              </div>
            </div>
          </div>
        } @else if (loaded()) {
          @if (canEdit()) {
            <span class="next-step-actions">
              <p-button label="Set next action" icon="pi pi-plus" size="small" (onClick)="openEdit()" />
            </span>
          }
        }
      } @else {
        @if (variant() === 'line') {
          <i class="pi pi-flag next-step-icon" aria-hidden="true"></i>
        }
        @if (step()?.text; as text) {
          @if (variant() === 'line') {
            <span class="next-step-label">Next action:</span>
          }
          <span class="next-step-text">{{ text }}</span>
          @if (step()?.date) {
            <span class="next-step-meta">{{ dateLabel() }}</span>
          }
          @if (step()?.owner; as o) {
            <app-person [firstName]="o.firstName" [lastName]="o.lastName" [name]="o.name" [email]="o.email" [avatarUrl]="o.avatarUrl" [personId]="o.id" [size]="20" />
          }
          @if (showInlineStatus()) {
            @if (step()?.overdue) {
              <p-tag value="Overdue" severity="danger" />
            } @else if (dueToday()) {
              <p-tag value="Due today" severity="warn" />
            }
          }
          @if (canEdit()) {
            <span class="next-step-actions">
              <p-button label="Edit" severity="secondary" [text]="true" size="small" (onClick)="openEdit()" />
              <p-button label="Done" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="done()" />
            </span>
          }
        } @else if (loaded()) {
          @if (canEdit()) {
            <span class="next-step-actions">
              <p-button label="Set next action" icon="pi pi-plus" size="small" (onClick)="openEdit()" />
            </span>
          }
        }
      }
    </div>

    <p-dialog
      header="Next action"
      [(visible)]="editVisible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!busy()"
      [style]="{ width: 'min(32rem, 96vw)' }"
      appendTo="body"
    >
      <div class="next-step-form">
        <div class="form-field">
          <label for="nextStepText">Next Action <app-help-text key="lead.nextAction" /></label>
          <app-creatable-select
            inputId="nextStepText"
            [(value)]="draftText"
            [options]="nextActionOptions.options()"
            placeholder="Select or type next action"
          />
        </div>
        <div class="form-field">
          <label for="nextStepDate">Next Action Date <app-help-text key="lead.nextActionDate" /></label>
          <app-date-input inputId="nextStepDate" [(ngModel)]="draftDate" [ngModelOptions]="{ standalone: true }" />
        </div>
        <div class="form-field">
          <label for="nextStepOwner">Owner</label>
          <p-select
            inputId="nextStepOwner"
            [options]="owners()"
            optionLabel="label"
            optionValue="id"
            [(ngModel)]="draftOwnerId"
            [ngModelOptions]="{ standalone: true }"
            [filter]="true"
            filterBy="label"
            filterPlaceholder="Search…"
            [showClear]="true"
            placeholder="Search and select…"
            appendTo="body"
            styleClass="w-full"
          >
            <ng-template #item let-option>
              <app-person [name]="option.label" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="22" />
            </ng-template>
            <ng-template #selectedItem let-option>
              <app-person [name]="option.label" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="22" />
            </ng-template>
          </p-select>
        </div>
        @if (error()) {
          <p-message severity="error" [text]="error()!" />
        }
      </div>
      <ng-template pTemplate="footer">
        @if (step()?.text) {
          <p-button label="Clear" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="clear()" />
        }
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="editVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" [disabled]="!draftText?.trim()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .next-step {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .next-step--panel-root {
      display: block;
      width: 100%;
    }
    .next-step--line {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 0.5rem;
      background: var(--surface-50, #f9fafb);
      min-height: 2.75rem;
    }
    .next-step--overdue { border-color: #fecaca; background: #fef2f2; }
    .next-step-icon { color: #2563eb; }
    .next-step--overdue .next-step-icon { color: #b91c1c; }
    .next-step-label { font-weight: 600; }
    .next-step-text { min-width: 0; overflow-wrap: anywhere; }
    .next-step-meta { color: var(--text-color-secondary, #6b7280); }
    .next-step-actions { display: inline-flex; gap: 0.25rem; margin-left: auto; }
    .next-step-form { display: flex; flex-direction: column; gap: 1rem; }
    .next-step-panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .next-step-panel-top {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-width: 0;
    }
    .next-step-panel-owner {
      min-width: 0;
      flex: 1 1 auto;
      max-width: 100%;
    }
    .next-step-panel-owner ::ng-deep .person {
      max-width: 100%;
    }
    .next-step-panel-date {
      flex-shrink: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
      text-align: right;
      white-space: nowrap;
    }
    .next-step-panel-date--overdue {
      font-weight: 700;
      color: #b91c1c;
    }
    .next-step-panel-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 0;
    }
    .next-step-panel-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .next-step-panel-actions .next-step-actions {
      margin-left: 0;
    }
  `,
})
export class NextStepComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);
  readonly nextActionOptions = inject(NextActionOptionsLoader);

  clientId = input.required<string>();
  canEdit = input(true);
  /** line: boxed one-liner with a flag (page header). panel: plain, inside a card titled Next step. */
  variant = input<'line' | 'panel'>('line');
  /** Set false when the parent shows Overdue / Due today in the panel header (`headerStatus`). Default true. */
  showInlineStatus = input(true);
  /** Emit Overdue / Due today for the parent header when `showInlineStatus` is false. */
  headerStatus = output<{ label: string; severity: 'danger' | 'warn' } | null>();

  step = signal<NextStep | null>(null);
  loaded = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);
  owners = signal<OwnerOption[]>([]);

  editVisible = false;
  draftText: string | null = '';
  draftDate = '';
  draftOwnerId: string | null = null;

  readonly dateLabel = computed(() => {
    const iso = this.step()?.date;
    if (!iso) return '';
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  });

  readonly dueToday = computed(() => {
    const iso = this.step()?.date;
    return !!iso && dateKey(new Date(iso)) === dateKey(new Date());
  });

  constructor() {
    this.nextActionOptions.load();
    effect(() => {
      const id = this.clientId();
      this.comms.activityChanged();
      untracked(() => void this.load(id));
    });
    effect(() => {
      if (this.showInlineStatus()) return;
      const s = this.step();
      const today = this.dueToday();
      untracked(() => this.emitHeaderStatus(s, today));
    });
  }

  private emitHeaderStatus(s: NextStep | null, dueToday: boolean) {
    if (!s?.text) {
      this.headerStatus.emit(null);
      return;
    }
    if (s.overdue) {
      this.headerStatus.emit({ label: 'Overdue', severity: 'danger' });
    } else if (dueToday) {
      this.headerStatus.emit({ label: 'Due today', severity: 'warn' });
    } else {
      this.headerStatus.emit(null);
    }
  }

  private async load(id: string) {
    if (!this.showInlineStatus()) {
      this.headerStatus.emit(null);
    }
    try {
      this.step.set(await this.comms.nextStep(id));
    } catch {
      this.step.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async openEdit() {
    this.nextActionOptions.load();
    const s = this.step();
    this.draftText = s?.text ?? '';
    this.draftDate = s?.date ? dateKey(new Date(s.date)) : '';
    this.draftOwnerId = s?.owner?.id ?? null;
    this.error.set(null);
    this.editVisible = true;
    if (!this.owners().length) {
      const team = await this.comms.team().catch(() => [] as TeamMember[]);
      this.owners.set(
        team.map((u) => ({
          id: u.id,
          label: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          avatarUrl: u.avatarUrl,
        })),
      );
    }
  }

  async save() {
    this.busy.set(true);
    this.error.set(null);
    try {
      // Noon local time, so the date does not shift across time zones.
      const day = this.draftDate ? parseDateKey(this.draftDate) : null;
      day?.setHours(12, 0, 0, 0);
      const date = day ? day.toISOString() : null;
      this.step.set(
        await this.comms.setNextStep(this.clientId(), { text: this.draftText?.trim() ?? '', date, ownerId: this.draftOwnerId }),
      );
      this.editVisible = false;
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not save the next step');
    } finally {
      this.busy.set(false);
    }
  }

  async clear() {
    this.busy.set(true);
    try {
      this.step.set(await this.comms.setNextStep(this.clientId(), { text: null }));
      this.editVisible = false;
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not clear the next step');
    } finally {
      this.busy.set(false);
    }
  }

  async done() {
    this.busy.set(true);
    try {
      this.step.set(await this.comms.completeNextStep(this.clientId()));
      this.toast.add({ severity: 'success', summary: 'Done', detail: 'Logged on the timeline. What happens next?' });
      this.comms.notifyActivityChanged();
      await this.openEdit();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not complete', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.busy.set(false);
    }
  }
}
