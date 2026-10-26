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
import { QuillModule } from 'ngx-quill';
import { AppDialogModule } from '../../core/app-dialog.module';
import { richTextOrUndefined } from '../../core/rich-text.util';
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
    QuillModule,
    MessageBodyComponent,
  ],
  template: `
    <div class="card">
      <div class="activity-header">
        <h3 class="text-lg font-semibold mb-0">Activity</h3>
        @if (canLog()) {
          <div class="activity-header-actions">
            <p-button label="Log activity" icon="pi pi-plus" size="small" (onClick)="openLog()" />
          </div>
        }
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" class="mb-3" />
      }

      @if (!(loading() && items().length === 0)) {
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
          <p>{{ emptyMessage() }}</p>
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
              @if (item.location) {
                <span>{{ item.location }}</span>
              }
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
        @if (logType === 'CALL') {
          <div class="form-field">
            <label for="logDirection">Who called</label>
            <p-select
              inputId="logDirection"
              [options]="callOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="logDirection"
              appendTo="body"
              styleClass="w-full"
            />
          </div>
        }
        @if (logType === 'MEETING') {
          <div class="form-field">
            <label for="logWhere">Where</label>
            <input pInputText id="logWhere" [(ngModel)]="logWhere" class="w-full" placeholder="Zoom, their office, a coffee shop…" />
          </div>
        }
        <div class="form-field">
          <label for="logSubject">Subject</label>
          <input pInputText id="logSubject" [(ngModel)]="logSubject" class="w-full" [placeholder]="subjectPlaceholder()" />
        </div>
        <div class="form-field">
          <label for="logBody">Notes / next steps</label>
          @if (logVisible) {
            <quill-editor
              id="logBody"
              name="logBody"
              [(ngModel)]="logBody"
              placeholder="Notes, next steps…"
              [styles]="{ 'min-height': '140px' }"
            />
          }
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
              appendTo="body"
              styleClass="w-full involved-select"
            >
              <ng-template #item let-option>
                <app-person
                  [name]="option.label"
                  [firstName]="option.firstName"
                  [lastName]="option.lastName"
                  [avatarUrl]="option.avatarUrl"
                  [personId]="option.id"
                  [size]="22"
                />
              </ng-template>
              <ng-template #selecteditems let-options let-removeChip="removeChip">
                @for (option of options ?? []; track option.id) {
                  <span class="involved-chip">
                    <app-person
                      [name]="option.label"
                      [firstName]="option.firstName"
                      [lastName]="option.lastName"
                      [avatarUrl]="option.avatarUrl"
                      [personId]="option.id"
                      [size]="26"
                    />
                    <button type="button" class="involved-chip-remove" [attr.aria-label]="'Remove ' + option.label" (click)="removeChip(option.id, $event)">
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          fill="currentColor"
                          fill-rule="evenodd"
                          d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16ZM5.1 4.2 8 7.1l2.9-2.9 0.9 0.9L8.9 8l2.9 2.9-0.9 0.9L8 8.9l-2.9 2.9-0.9-0.9L7.1 8 4.2 5.1l0.9-0.9Z"
                        />
                      </svg>
                    </button>
                  </span>
                }
              </ng-template>
            </p-multiselect>
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
    .activity-date { white-space: nowrap; font-size: var(--fs-sm); color: var(--text-color-secondary, #6b7280); cursor: default; }
    .activity-arrow { font-size: var(--fs-sm); color: var(--text-color-secondary); }
    .activity-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25rem 0; font-size: var(--fs-sm); color: var(--text-color-secondary, #6b7280); }
    .activity-footer { margin-top: 0.25rem; margin-left: -0.5rem; }
    .activity-more { text-align: center; margin-top: 0.5rem; }
    .log-form { display: flex; flex-direction: column; gap: 1rem; }
    .involved-chip {
      display: inline-flex;
      align-items: center;
      gap: 0;
      margin: 0;
      padding: 0 0.35rem 0 0.15rem;
      border-radius: 1rem;
      background: var(--p-chip-background, var(--surface-100, #f3f4f6));
    }
    :host ::ng-deep .involved-select.p-multiselect {
      min-height: 2.25rem;
      align-items: center;
    }
    :host ::ng-deep .involved-select .p-multiselect-label-container {
      display: flex;
      align-items: center;
    }
    :host ::ng-deep .involved-select .p-multiselect-label {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      width: 100%;
      padding-block: 0;
      line-height: 1.2;
    }
    .involved-chip-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 6px;
      border: 0;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .involved-chip-remove svg {
      width: 0.85rem;
      height: 0.85rem;
      display: block;
    }
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
  filter = signal<TypeFilter>('ALL');
  readonly skeletonRows = [1, 2, 3];
  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'ALL' ? this.items() : this.items().filter((i) => i.type === f);
  });
  readonly filterName = computed(() => this.filterOptions.find((o) => o.value === this.filter())?.label.toLowerCase() ?? 'activity');
  readonly emptyMessage = computed(() =>
    this.canLog()
      ? 'No activity yet. Use Log activity to record a call, meeting, or note.'
      : 'No activity yet.',
  );

  // Log dialog state
  logVisible = false;
  saving = signal(false);
  logError = signal<string | null>(null);
  logType: 'CALL' | 'MEETING' | 'NOTE' = 'CALL';
  logWhen = nowForInput();
  logDirection: 'INBOUND' | 'OUTBOUND' | 'INTERNAL' = 'OUTBOUND';
  logWhere = '';
  logSubject = '';
  logBody = '';
  logContactIds: string[] = [];
  contactOptions = signal<{ id: string; label: string; firstName: string; lastName: string | null; avatarUrl: string | null }[]>([]);

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
  readonly callOptions = [
    { label: 'We called', value: 'OUTBOUND' },
    { label: 'They called', value: 'INBOUND' },
    { label: 'Internal', value: 'INTERNAL' },
  ];

  constructor() {
    effect(() => {
      this.target(); // reload whenever the subject changes
      void this.load(false);
    });
  }

  subjectPlaceholder(): string {
    if (this.logType === 'MEETING') return 'e.g. Discovery meeting';
    if (this.logType === 'NOTE') return 'e.g. Follow-up';
    return 'e.g. Intake call';
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
    this.logWhere = '';
    this.logSubject = '';
    this.logBody = '';
    this.logContactIds = [];
    this.logError.set(null);
    this.logVisible = true;
    const clientId = this.clientId();
    if (clientId && this.contactOptions().length === 0) {
      try {
        const contacts: ContactSummary[] = await this.comms.contacts({ clientId });
        this.contactOptions.set(
          contacts.map((c) => ({
            id: c.id,
            label: contactName(c),
            firstName: c.firstName,
            lastName: c.lastName,
            avatarUrl: c.avatarUrl ?? null,
          })),
        );
      } catch {
        this.contactOptions.set([]);
      }
    }
  }

  async saveLog() {
    const notes = richTextOrUndefined(this.logBody);
    if (!this.logSubject.trim() && !notes) {
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
        bodyText: notes,
        location: this.logType === 'MEETING' ? this.logWhere.trim() || undefined : undefined,
        direction: this.logType === 'CALL' ? this.logDirection : this.logType === 'NOTE' ? 'INTERNAL' : 'OUTBOUND',
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
