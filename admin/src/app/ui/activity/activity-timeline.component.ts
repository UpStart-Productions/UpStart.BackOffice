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
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AppDialogModule } from '../../core/app-dialog.module';
import {
  CommunicationsApi,
  contactName,
  ContactSummary,
  directionLabel,
  Interaction,
  interactionIcon,
  InteractionType,
  LogInteractionPayload,
  participantLine,
  senderAndRecipients,
  relativeTime,
  TimelineTarget,
} from '../../core/communications.api';
import { EmailButtonComponent } from '../email-button/email-button.component';
import { MessageBodyComponent } from '../message-body/message-body.component';
import { PersonComponent } from '../person/person.component';

type TypeFilter = 'ALL' | InteractionType;

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
  imports: [PersonComponent, 
    DatePipe,
    FormsModule,
    AppDialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    TagModule,
    TextareaModule,
    EmailButtonComponent,
    MessageBodyComponent,
  ],
  template: `
    <div class="card">
      <div class="activity-header">
        <h3 class="text-lg font-semibold mb-0">Activity</h3>
        <div class="activity-header-actions">
          <app-email-button [to]="emailTo()" [subject]="emailSubject()" />
          @if (canLog()) {
            <p-button label="Log call / note" icon="pi pi-plus" size="small" (onClick)="openLog()" />
          }
        </div>
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" class="mb-3" />
      }

      @if (items().length > 0) {
        <div class="activity-filter">
          <p-selectbutton
            [options]="filterOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="filter()"
            (ngModelChange)="filter.set($event)"
            [allowEmpty]="false"
            size="small"
            ariaLabelledBy="activityFilterLabel"
          />
          <span id="activityFilterLabel" class="sr-only">Filter activity by type</span>
        </div>
      }

      @if (loading() && items().length === 0) {
        <div class="activity-skeleton" aria-busy="true" aria-label="Loading activity">
          @for (n of skeletonRows; track n) {
            <div class="activity-item">
              <p-skeleton shape="circle" size="2rem" />
              <div class="activity-body">
                <p-skeleton width="45%" height="1rem" styleClass="mb-2" />
                <p-skeleton width="30%" height="0.8rem" />
              </div>
            </div>
          }
        </div>
      } @else if (items().length === 0) {
        <div class="empty-state">
          <i class="pi pi-comments" aria-hidden="true"></i>
          <p>No activity yet. CC UBO on an email (the Email button does it for you) or log a call or note.</p>
        </div>
      } @else if (visible().length === 0) {
        <div class="empty-state">
          <i class="pi pi-filter" aria-hidden="true"></i>
          <p>No {{ filterName() }} in the activity loaded so far.{{ nextBefore() ? ' Try loading older activity.' : '' }}</p>
        </div>
      }

      @for (item of visible(); track item.id) {
        <div class="activity-item">
          <div class="activity-icon activity-icon--{{ item.type }}" [attr.aria-label]="item.type" role="img">
            <i class="pi {{ icon(item) }}" aria-hidden="true"></i>
          </div>
          <div class="activity-body">
            <div class="activity-head">
              <strong>{{ item.subject || '(no subject)' }}</strong>
              <span class="activity-date" [title]="(item.occurredAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(item.occurredAt) }}</span>
            </div>
            <div class="activity-meta">
              <p-tag [value]="directionLabel(item)" severity="secondary" />
              @let ppl = people(item);
              @if (ppl.from) {
                <app-person [name]="ppl.from.name" [email]="ppl.from.email" [avatarUrl]="ppl.from.avatarUrl" [personId]="ppl.from.contactId ?? ppl.from.userId ?? ppl.from.email" [size]="20" />
                @if (ppl.to.length) { <i class="pi pi-arrow-right activity-arrow" aria-label="to"></i> }
              }
              @for (p of ppl.to; track p.email) {
                <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" [size]="20" />
              }
              @if (item.loggedBy?.name) {
                <span class="activity-logged-by">· logged by</span>
                <app-person [name]="item.loggedBy!.name" [firstName]="item.loggedBy!.firstName" [lastName]="item.loggedBy!.lastName" [avatarUrl]="item.loggedBy!.avatarUrl" [personId]="item.loggedBy!.id" [size]="20" />
              } @else if (item.captures.length) {
                <span>· captured by {{ item.captures[0].capturedByEmail }}</span>
              }
            </div>

            <app-message-body [item]="item" />

            @if (item.status === 'FILED' && item.type === 'EMAIL' && !contactId()) {
              <div class="activity-footer">
                <p-button
                  label="Move to Unfiled"
                  icon="pi pi-inbox"
                  size="small"
                  severity="secondary"
                  [text]="true"
                  (onClick)="unfile(item)"
                />
              </div>
            }
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
    .activity-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .activity-header-actions { display: flex; align-items: center; gap: 0.5rem; }
    .activity-filter { margin-bottom: 0.5rem; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .activity-item { display: flex; gap: 0.85rem; padding: 0.9rem 0; border-top: 1px solid var(--surface-border, #e5e7eb); }
    .activity-item:first-of-type { border-top: 0; }
    .activity-icon { --c: var(--text-color-secondary, #6b7280); flex: 0 0 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .activity-icon--EMAIL { --c: #2563eb; }
    .activity-icon--CALL { --c: #16a34a; }
    .activity-icon--MEETING { --c: #7c3aed; }
    .activity-icon--NOTE { --c: #d97706; }
    .activity-body { flex: 1; min-width: 0; }
    .activity-head { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
    .activity-date { white-space: nowrap; font-size: 0.85rem; color: var(--text-color-secondary, #6b7280); cursor: default; }
    .activity-arrow { font-size: 0.75rem; color: var(--text-color-secondary); }
    .activity-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25rem 0; font-size: 0.875rem; color: var(--text-color-secondary, #6b7280); }
    .activity-footer { margin-top: 0.25rem; margin-left: -0.5rem; }
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
  /** Pre-filled To address for the Email button. */
  emailTo = input<string | null | undefined>();
  emailSubject = input<string | null | undefined>();

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
  filter = signal<TypeFilter>('ALL');
  readonly skeletonRows = [1, 2, 3];
  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'ALL' ? this.items() : this.items().filter((i) => i.type === f);
  });
  readonly filterName = computed(() => this.filterOptions.find((o) => o.value === this.filter())?.label.toLowerCase() ?? 'activity');

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

  readonly filterOptions: { label: string; value: TypeFilter }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Emails', value: 'EMAIL' },
    { label: 'Calls', value: 'CALL' },
    { label: 'Meetings', value: 'MEETING' },
    { label: 'Notes', value: 'NOTE' },
  ];
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
  readonly people = senderAndRecipients;
  directionLabel = directionLabel;
  rel = relativeTime;

  async load(more: boolean) {
    const target = this.target();
    if (!target) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.comms.timeline(target, more ? this.nextBefore() : null);
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.nextBefore.set(page.nextBefore);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      this.loading.set(false);
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
