import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AppDialogModule } from '../../core/app-dialog.module';
import {
  CommunicationsApi,
  contactName,
  ContactSummary,
  Interaction,
  interactionIcon,
  LogInteractionPayload,
  participantLine,
  TimelineTarget,
} from '../../core/communications.api';

const DIRECTION_LABEL = { INBOUND: 'Incoming', OUTBOUND: 'Outgoing', INTERNAL: 'Internal' } as const;

/** `datetime-local` wants local time without a zone, e.g. 2026-10-17T14:30. */
function nowForInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Communication timeline for one client, lead or contact: emails captured from Gmail
 * plus calls, meetings and notes logged by hand.
 */
@Component({
  selector: 'app-activity-timeline',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    AppDialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    SelectButtonModule,
    TagModule,
    TextareaModule,
  ],
  template: `
    <div class="card">
      <div class="activity-header">
        <h3 class="text-lg font-semibold mb-0">Activity</h3>
        @if (canLog()) {
          <p-button label="Log call / note" icon="pi pi-plus" size="small" (onClick)="openLog()" />
        }
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" class="mb-3" />
      }

      @if (loading() && items().length === 0) {
        <p class="text-color-secondary">Loading…</p>
      } @else if (items().length === 0) {
        <p class="text-color-secondary">
          No activity yet. Emails forwarded to your capture address will appear here, or log a call or note.
        </p>
      }

      @for (item of items(); track item.id) {
        <div class="activity-item">
          <div class="activity-icon" [attr.aria-label]="item.type">
            <i class="pi {{ icon(item) }}"></i>
          </div>
          <div class="activity-body">
            <div class="activity-head">
              <strong>{{ item.subject || '(no subject)' }}</strong>
              <span class="activity-date">{{ item.occurredAt | date: 'MMM d, y, h:mm a' }}</span>
            </div>
            <div class="activity-meta">
              <p-tag [value]="directionLabel(item)" severity="secondary" />
              <span>{{ participants(item) }}</span>
              @if (item.loggedBy?.name) {
                <span>· logged by {{ item.loggedBy?.name }}</span>
              } @else if (item.captures.length) {
                <span>· captured by {{ item.captures[0].capturedByEmail }}</span>
              }
            </div>

            @if (expanded()[item.id] !== undefined) {
              <pre class="activity-text">{{ expanded()[item.id] }}</pre>
            } @else if (item.snippet) {
              <p class="activity-snippet">{{ item.snippet }}</p>
            }

            <div class="activity-actions">
              @if (item.snippet) {
                <button type="button" class="link-btn" (click)="toggle(item)">
                  {{ expanded()[item.id] !== undefined ? 'Show less' : 'Read more' }}
                </button>
              }
              @if (item.status === 'FILED' && item.type === 'EMAIL' && !contactId()) {
                <button type="button" class="link-btn" (click)="unfile(item)">Move to Unfiled</button>
              }
            </div>
          </div>
        </div>
      }

      @if (nextBefore()) {
        <div class="activity-more">
          <p-button label="Load older" severity="secondary" [text]="true" [loading]="loading()" (onClick)="load(true)" />
        </div>
      }
    </div>

    <p-dialog
      header="Log activity"
      [(visible)]="logVisible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!saving()"
      [style]="{ width: 'min(36rem, 96vw)' }"
    >
      <div class="log-form">
        <p-selectbutton
          [options]="typeOptions"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="logType"
          [allowEmpty]="false"
          name="logType"
        />
        <div class="form-field">
          <label for="logWhen">When</label>
          <input pInputText id="logWhen" type="datetime-local" [(ngModel)]="logWhen" class="w-full" />
        </div>
        @if (logType !== 'NOTE') {
          <div class="form-field">
            <label for="logDirection">Direction</label>
            <p-select
              inputId="logDirection"
              [options]="directionOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="logDirection"
              styleClass="w-full"
            />
          </div>
        }
        <div class="form-field">
          <label for="logSubject">Subject</label>
          <input pInputText id="logSubject" [(ngModel)]="logSubject" class="w-full" placeholder="e.g. Intake call" />
        </div>
        <div class="form-field">
          <label for="logBody">Notes / next steps</label>
          <textarea pTextarea id="logBody" [(ngModel)]="logBody" rows="5" class="w-full"></textarea>
        </div>
        @if (clientId() && contactOptions().length) {
          <div class="form-field">
            <label for="logContacts">Who was involved</label>
            <p-multiselect
              inputId="logContacts"
              [options]="contactOptions()"
              optionLabel="label"
              optionValue="id"
              [(ngModel)]="logContactIds"
              placeholder="Select contacts"
              display="chip"
              styleClass="w-full"
            />
          </div>
        }
        @if (logError()) {
          <p-message severity="error" [text]="logError()!" />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="logVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="saveLog()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .activity-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .activity-item { display: flex; gap: 0.85rem; padding: 0.9rem 0; border-top: 1px solid var(--surface-border, #e5e7eb); }
    .activity-item:first-of-type { border-top: 0; }
    .activity-icon { flex: 0 0 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--surface-100, #f3f4f6); color: var(--text-color-secondary, #6b7280); }
    .activity-body { flex: 1; min-width: 0; }
    .activity-head { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    .activity-date { white-space: nowrap; font-size: 0.85rem; color: var(--text-color-secondary, #6b7280); }
    .activity-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25rem 0; font-size: 0.875rem; color: var(--text-color-secondary, #6b7280); }
    .activity-snippet { margin: 0.25rem 0; }
    .activity-text { margin: 0.5rem 0; white-space: pre-wrap; word-break: break-word; font: inherit; max-height: 24rem; overflow: auto; background: var(--surface-50, #f9fafb); padding: 0.75rem; border-radius: 6px; }
    .activity-actions { display: flex; gap: 1rem; }
    .link-btn { background: none; border: 0; padding: 0; cursor: pointer; font-size: 0.85rem; color: var(--primary-color, #2563eb); }
    .activity-more { text-align: center; margin-top: 0.5rem; }
    .log-form { display: flex; flex-direction: column; gap: 1rem; }
  `,
})
export class ActivityTimelineComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  clientId = input<string>();
  leadId = input<string>();
  contactId = input<string>();

  readonly target = computed<TimelineTarget | null>(() => {
    const c = this.clientId();
    const l = this.leadId();
    const k = this.contactId();
    if (c) return { clientId: c };
    if (l) return { leadId: l };
    if (k) return { contactId: k };
    return null;
  });
  readonly canLog = computed(() => !!this.clientId() || !!this.leadId());

  items = signal<Interaction[]>([]);
  nextBefore = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  /** Full message text by interaction id, once the user opened it. */
  expanded = signal<Record<string, string>>({});

  // Log dialog state
  logVisible = false;
  saving = signal(false);
  logError = signal<string | null>(null);
  logType: 'CALL' | 'MEETING' | 'NOTE' = 'CALL';
  logWhen = nowForInput();
  logDirection: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' = 'OUTBOUND';
  logSubject = '';
  logBody = '';
  logContactIds: string[] = [];
  contactOptions = signal<{ id: string; label: string }[]>([]);

  readonly typeOptions = [
    { label: 'Call', value: 'CALL' },
    { label: 'Meeting', value: 'MEETING' },
    { label: 'Note', value: 'NOTE' },
  ];
  readonly directionOptions = [
    { label: 'I called / reached out', value: 'OUTBOUND' },
    { label: 'They called / reached out', value: 'INBOUND' },
    { label: 'Internal', value: 'INTERNAL' },
  ];

  constructor() {
    effect(() => {
      this.target(); // reload whenever the subject changes
      void this.load(false);
    });
  }

  icon = (i: Interaction) => interactionIcon(i.type);
  participants = (i: Interaction) => participantLine(i);
  directionLabel = (i: Interaction) => (i.type === 'NOTE' ? 'Note' : DIRECTION_LABEL[i.direction]);

  async load(more: boolean) {
    const target = this.target();
    if (!target) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.comms.timeline(target, more ? this.nextBefore() : null);
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.nextBefore.set(page.nextBefore);
      if (!more) this.expanded.set({});
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(item: Interaction) {
    const open = this.expanded();
    if (open[item.id] !== undefined) {
      const { [item.id]: _removed, ...rest } = open;
      this.expanded.set(rest);
      return;
    }
    try {
      const full = await this.comms.interaction(item.id);
      this.expanded.set({ ...open, [item.id]: full.bodyText ?? item.snippet ?? '' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load message');
    }
  }

  async unfile(item: Interaction) {
    try {
      await this.comms.unfile(item.id);
      this.items.set(this.items().filter((i) => i.id !== item.id));
      void this.comms.refreshUnfiledCount();
      this.toast.add({ severity: 'success', summary: 'Moved', detail: 'Moved back to the Unfiled inbox.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to move');
    }
  }

  async openLog() {
    this.logType = 'CALL';
    this.logWhen = nowForInput();
    this.logDirection = 'OUTBOUND';
    this.logSubject = '';
    this.logBody = '';
    this.logContactIds = [];
    this.logError.set(null);
    this.logVisible = true;
    const clientId = this.clientId();
    if (clientId && this.contactOptions().length === 0) {
      try {
        const contacts: ContactSummary[] = await this.comms.contacts({ clientId });
        this.contactOptions.set(contacts.map((c) => ({ id: c.id, label: contactName(c) })));
      } catch {
        this.contactOptions.set([]);
      }
    }
  }

  async saveLog() {
    if (!this.logSubject.trim() && !this.logBody.trim()) {
      this.logError.set('Add a subject or some notes.');
      return;
    }
    this.saving.set(true);
    this.logError.set(null);
    try {
      const payload: LogInteractionPayload = {
        type: this.logType,
        clientId: this.clientId(),
        leadId: this.leadId(),
        occurredAt: this.logWhen ? new Date(this.logWhen).toISOString() : undefined,
        subject: this.logSubject.trim() || undefined,
        bodyText: this.logBody.trim() || undefined,
        direction: this.logType === 'NOTE' ? 'INTERNAL' : this.logDirection,
        contactIds: this.logContactIds.length ? this.logContactIds : undefined,
      };
      await this.comms.log(payload);
      this.logVisible = false;
      this.toast.add({ severity: 'success', summary: 'Logged', detail: 'Activity added to the timeline.' });
      await this.load(false);
    } catch (err) {
      this.logError.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
