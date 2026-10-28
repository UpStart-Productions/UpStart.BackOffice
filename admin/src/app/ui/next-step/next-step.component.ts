import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
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
import { DateInputComponent } from '../date-input/date-input.component';
import { PersonComponent } from '../person/person.component';

type OwnerOption = { id: string; label: string; firstName: string | null; lastName: string | null; avatarUrl: string | null };

/**
 * One-line next step for an organization: what happens next, when, and who owns it.
 * Done records "Done: …" on the timeline, clears the step and opens the editor for the next one.
 * Used in the organization/client page header and on the Activity page.
 */
@Component({
  selector: 'app-next-step',
  standalone: true,
  imports: [FormsModule, AppDialogModule, ButtonModule, InputTextModule, MessageModule, SelectModule, TagModule, DateInputComponent, PersonComponent],
  template: `
    <div class="next-step" [class.next-step--overdue]="step()?.overdue" [class.next-step--missing]="loaded() && !step()?.text">
      <i class="pi pi-flag next-step-icon" aria-hidden="true"></i>
      @if (step()?.text; as text) {
        <span class="next-step-label">Next step:</span>
        <span class="next-step-text">{{ text }}</span>
        @if (step()?.date) {
          <span class="next-step-meta">· {{ dateLabel() }}</span>
        }
        @if (step()?.owner; as o) {
          <span class="next-step-meta">·</span>
          <app-person [firstName]="o.firstName" [lastName]="o.lastName" [name]="o.name" [email]="o.email" [avatarUrl]="o.avatarUrl" [personId]="o.id" [size]="20" />
        }
        @if (step()?.overdue) {
          <p-tag value="Overdue" severity="danger" />
        } @else if (dueToday()) {
          <p-tag value="Due today" severity="warn" />
        }
        @if (canEdit()) {
          <span class="next-step-actions">
            <p-button label="Done" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="done()" />
            <p-button label="Edit" severity="secondary" [text]="true" size="small" (onClick)="openEdit()" />
          </span>
        }
      } @else if (loaded()) {
        <span class="next-step-none">No next step set</span>
        @if (canEdit()) {
          <span class="next-step-actions">
            <p-button label="Set next step" icon="pi pi-plus" size="small" (onClick)="openEdit()" />
          </span>
        }
      }
    </div>

    <p-dialog
      header="Next step"
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
          <label for="nextStepText">What happens next</label>
          <input pInputText id="nextStepText" [(ngModel)]="draftText" [ngModelOptions]="{ standalone: true }" class="w-full" placeholder="e.g. Send the revised proposal" />
        </div>
        <div class="form-field">
          <label for="nextStepDate">When</label>
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
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" [disabled]="!draftText.trim()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .next-step {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 0.5rem;
      background: var(--surface-50, #f9fafb);
      min-height: 2.75rem;
    }
    .next-step--overdue { border-color: #fecaca; background: #fef2f2; }
    .next-step--missing { border-style: dashed; }
    .next-step-icon { color: #2563eb; }
    .next-step--overdue .next-step-icon { color: #b91c1c; }
    .next-step-label { font-weight: 600; }
    .next-step-text { min-width: 0; overflow-wrap: anywhere; }
    .next-step-meta { color: var(--text-color-secondary, #6b7280); }
    .next-step-none { color: var(--text-color-secondary, #6b7280); }
    .next-step-actions { display: inline-flex; gap: 0.25rem; margin-left: auto; }
    .next-step-form { display: flex; flex-direction: column; gap: 1rem; }
  `,
})
export class NextStepComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  clientId = input.required<string>();
  canEdit = input(true);

  step = signal<NextStep | null>(null);
  loaded = signal(false);
  busy = signal(false);
  error = signal<string | null>(null);
  owners = signal<OwnerOption[]>([]);

  editVisible = false;
  draftText = '';
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
    effect(() => {
      const id = this.clientId();
      this.comms.activityChanged();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string) {
    try {
      this.step.set(await this.comms.nextStep(id));
    } catch {
      this.step.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async openEdit() {
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
        await this.comms.setNextStep(this.clientId(), { text: this.draftText.trim(), date, ownerId: this.draftOwnerId }),
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
