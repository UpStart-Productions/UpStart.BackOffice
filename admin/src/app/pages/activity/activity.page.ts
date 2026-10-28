import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { map } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import {
  ActivityFeedFilter,
  ActivityQueues,
  CommunicationsApi,
  ContactSummary,
  contactName,
  Interaction,
  participantLine,
  QueueRow,
  relativeTime,
  senderAndRecipients,
  directionLabel,
  TeamMember,
} from '../../core/communications.api';
import { contactIdFromDirectoryId, PeoplePickerLoader } from '../../core/people-picker.loader';
import { PeopleDirectoryOption } from '../projects/people-directory.util';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { MessageBodyComponent } from '../../ui/message-body/message-body.component';
import { NextStepComponent } from '../../ui/next-step/next-step.component';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { PersonComponent } from '../../ui/person/person.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

type Tab = 'todo' | 'all';
type QueueKey = 'reply' | 'nextStep' | 'quiet' | 'unfiled';
type Org = { id: string; name: string; journey?: 'PROSPECT' | 'CLIENT' | 'NONE'; isActive?: boolean };
type Option = { id: string; label: string };

const DAY = 24 * 60 * 60 * 1000;

const QUEUE_INFO: Record<QueueKey, { label: string; help: (t: ActivityQueues['thresholds']) => string }> = {
  reply: { label: 'Needs reply', help: (t) => `They wrote last and nobody has answered in ${t.needsReplyDays}+ day${t.needsReplyDays === 1 ? '' : 's'}.` },
  nextStep: { label: 'Next steps', help: () => 'Overdue or due today, or a prospect or active client with none set.' },
  quiet: { label: 'Gone quiet', help: (t) => `Active clients with no contact in ${t.goneQuietDays}+ days.` },
  unfiled: { label: 'Unfiled', help: () => "Captured email that couldn't be matched to one organization." },
};

function startOfDayIso(key: string): string | null {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function endOfDayIso(key: string): string | null {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * Activity: To do (Needs reply, Next steps, Gone quiet, Unfiled) and All activity across every organization,
 * optionally narrowed to one organization or person. Record pages link here with "Open full view".
 */
@Component({
  selector: 'app-activity-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    AppDialogModule,
    ButtonModule,
    CheckboxModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    TableModule,
    TabsModule,
    TagModule,
    PageComponent,
    HelpTextComponent,
    ActivityTimelineComponent,
    DateInputComponent,
    MessageBodyComponent,
    NextStepComponent,
    PeopleSelectComponent,
    PersonComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page title="Activity" [skipTitle]="true">
      <div class="card">
        <div class="activity-page-head">
          <h2 class="page-title page-title-in-card mb-0">Activity <app-help-text key="activity.page" /></h2>
          <div class="activity-page-filters">
            <div class="form-field activity-filter-field">
              <label for="activityOrg">Organization</label>
              <p-select
                inputId="activityOrg"
                [options]="orgs()"
                optionLabel="name"
                optionValue="id"
                [ngModel]="orgId()"
                (ngModelChange)="setOrg($event)"
                [filter]="true"
                filterBy="name"
                filterPlaceholder="Search…"
                [showClear]="true"
                placeholder="All organizations"
                appendTo="body"
                styleClass="w-full"
              />
            </div>
            <div class="form-field activity-filter-field">
              <label for="activityPerson">Person</label>
              <app-people-select
                inputId="activityPerson"
                [options]="peopleOptions()"
                [loading]="peopleLoading()"
                [pickId]="personPickId()"
                (pickIdChange)="setPerson($event)"
                placeholder="All people"
              />
            </div>
          </div>
        </div>

        @if (org(); as o) {
          <div class="activity-context">
            <div class="activity-context-title">
              <a [routerLink]="['/organizations', o.id]" class="activity-context-name">{{ o.name }}</a>
              @if (o.journey === 'CLIENT') {
                <p-tag [value]="o.isActive === false ? 'Client · Inactive' : 'Client · Active'" [severity]="o.isActive === false ? 'secondary' : 'success'" />
              } @else if (o.journey === 'PROSPECT') {
                <p-tag value="Prospect" severity="info" />
              }
              <a [routerLink]="['/organizations', o.id]" class="activity-context-back"><i class="pi pi-arrow-left" aria-hidden="true"></i> Back to the organization</a>
            </div>
            <app-next-step [clientId]="o.id" />
            @if (orgPeople().length) {
              <div class="activity-context-people">
                @for (p of orgPeople(); track p.id) {
                  <app-person [firstName]="p.firstName" [lastName]="p.lastName" [avatarUrl]="p.avatarUrl" [personId]="p.id" [link]="['/people', p.id]" [size]="24" />
                }
              </div>
            }
          </div>
        } @else if (person(); as p) {
          <div class="activity-context">
            <div class="activity-context-title">
              <a [routerLink]="['/people', p.id]" class="activity-context-name">{{ personLabel(p) }}</a>
              <a [routerLink]="['/people', p.id]" class="activity-context-back"><i class="pi pi-arrow-left" aria-hidden="true"></i> Back to the person</a>
            </div>
            @if (p.accountLinks.length) {
              <div class="activity-context-people">
                @for (l of p.accountLinks; track l.clientId) {
                  <a [routerLink]="['/organizations', l.clientId]">{{ l.client.name }}</a>
                }
              </div>
            }
          </div>
        }

        <p-tabs [value]="tab()" (valueChange)="setTab($event)">
          <p-tablist>
            <p-tab value="todo">To do @if (todoTotal()) { <span class="activity-count">{{ todoTotal() }}</span> }</p-tab>
            <p-tab value="all">All activity</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="todo">
              <div class="todo-toolbar">
                <p-selectbutton
                  [options]="scopeOptions"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="mine()"
                  (ngModelChange)="mine.set($event)"
                  [allowEmpty]="false"
                  ariaLabel="Whose items"
                />
              </div>

              @if (queuesError()) {
                <p-message severity="error" [text]="queuesError()!" styleClass="mb-3" />
              }

              <div class="queue-grid">
                @for (q of queueKeys; track q) {
                  <button type="button" class="queue-card" [class.queue-card--active]="queue() === q" [attr.aria-pressed]="queue() === q" (click)="setQueue(q)">
                    <span class="queue-card-head">
                      <span class="queue-card-label">{{ info[q].label }}</span>
                      <span class="queue-card-count" [class.queue-card-count--zero]="!countOf(q)">{{ countOf(q) }}</span>
                    </span>
                    <span class="queue-card-help">{{ info[q].help(thresholds()) }}</span>
                  </button>
                }
              </div>

              @if (queuesLoading() && !queues()) {
                <div class="skeleton-list" aria-busy="true">
                  @for (n of [1, 2, 3]; track n) { <p-skeleton height="2.5rem" /> }
                </div>
              } @else if (queue() === 'unfiled') {
                <p-table [value]="unfiled()" styleClass="table-bordered" dataKey="id">
                  <ng-template pTemplate="header">
                    <tr>
                      <th style="width: 3rem"></th>
                      <th style="width: 8rem">Received</th>
                      <th style="width: 20rem">People</th>
                      <th>Subject</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-item>
                    <tr class="clickable-row" (click)="mb.toggle()">
                      <td (click)="$event.stopPropagation()">
                        <app-row-actions-menu [items]="unfiledActions(item)" ariaLabel="Email actions" />
                      </td>
                      <td><span [title]="(item.occurredAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(item.occurredAt) }}</span></td>
                      <td>
                        @let ppl = sendersOf(item);
                        <div class="person-line">
                          <span class="person-label">From</span>
                          <span class="person-value">
                            @if (ppl.from) {
                              <app-person [name]="ppl.from.name" [email]="ppl.from.email" [avatarUrl]="ppl.from.avatarUrl" [personId]="ppl.from.contactId ?? ppl.from.userId ?? ppl.from.email" [size]="22" />
                            } @else { — }
                          </span>
                        </div>
                        <div class="person-line text-color-secondary">
                          <span class="person-label">To</span>
                          <span class="person-value person-list">
                            @for (p of ppl.to; track p.email) {
                              <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" [size]="22" />
                            } @empty { — }
                          </span>
                        </div>
                        <p-tag [value]="dir(item)" severity="secondary" class="person-tag" />
                      </td>
                      <td>
                        <strong>{{ item.subject || '(no subject)' }}</strong>
                        <app-message-body #mb [item]="item" />
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="4"><div class="empty-state"><i class="pi pi-check-circle" aria-hidden="true"></i><p>Nothing to file. You're all caught up.</p></div></td></tr>
                  </ng-template>
                </p-table>
              } @else {
                <p-table [value]="queueRows()" styleClass="table-bordered" dataKey="refKey">
                  <ng-template pTemplate="header">
                    <tr>
                      <th style="width: 3rem"></th>
                      <th>Organization / person</th>
                      <th>Why it's here</th>
                      <th style="width: 10rem">{{ whenHeader() }}</th>
                      <th style="width: 10rem">Owner</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-row>
                    <tr>
                      <td><app-row-actions-menu [items]="rowActions(row)" ariaLabel="To do actions" /></td>
                      <td>
                        @if (row.leadId) {
                          <a [routerLink]="['/pipeline', row.leadId]" class="font-semibold">{{ row.clientName || 'Pipeline card' }}</a>
                          <div class="text-color-secondary">Pipeline card</div>
                        } @else if (row.clientId) {
                          <a [routerLink]="['/organizations', row.clientId]" class="font-semibold">{{ row.clientName }}</a>
                        } @else {
                          <span class="font-semibold">—</span>
                        }
                        @if (row.person) {
                          <div class="text-color-secondary">
                            @if (row.contactId) { <a [routerLink]="['/people', row.contactId]">{{ row.person }}</a> } @else { {{ row.person }} }
                          </div>
                        }
                      </td>
                      <td>
                        <div>{{ row.title }}</div>
                        @if (row.missing) {
                          <p-tag value="Missing" severity="warn" />
                        } @else if (row.overdue) {
                          <p-tag value="Overdue" severity="danger" />
                        }
                      </td>
                      <td><span [class.text-overdue]="row.overdue">{{ whenLabel(row) }}</span></td>
                      <td>{{ row.owner || '—' }}</td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="5"><div class="empty-state"><i class="pi pi-check-circle" aria-hidden="true"></i><p>Nothing here. You're all caught up.</p></div></td></tr>
                  </ng-template>
                </p-table>
              }
            </p-tabpanel>

            <p-tabpanel value="all">
              <div class="all-filters">
                <div class="form-field activity-filter-field">
                  <label for="activityLoggedBy">Logged by</label>
                  <p-select
                    inputId="activityLoggedBy"
                    [options]="team()"
                    optionLabel="label"
                    optionValue="id"
                    [ngModel]="loggedBy()"
                    (ngModelChange)="loggedBy.set($event)"
                    [filter]="true"
                    filterBy="label"
                    filterPlaceholder="Search…"
                    [showClear]="true"
                    placeholder="Anyone"
                    appendTo="body"
                    styleClass="w-full"
                  />
                </div>
                <div class="form-field activity-filter-field">
                  <label for="activityFrom">From</label>
                  <app-date-input inputId="activityFrom" [ngModel]="from()" (ngModelChange)="from.set($event)" />
                </div>
                <div class="form-field activity-filter-field">
                  <label for="activityTo">To</label>
                  <app-date-input inputId="activityTo" [ngModel]="to()" (ngModelChange)="to.set($event)" />
                </div>
              </div>
              @if (tab() === 'all') {
                <app-activity-timeline
                  [global]="true"
                  [clientId]="orgId()"
                  [contactId]="orgId() ? null : personId()"
                  [organizationName]="org()?.name ?? undefined"
                  [feedFilter]="feedFilter()"
                  [hideHeader]="true"
                  [showFullViewLink]="false"
                />
              }
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </div>

      <p-dialog
        header="File this email"
        [(visible)]="fileVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [closable]="!saving()"
        [style]="{ width: 'min(32rem, 96vw)' }"
      >
        @if (active(); as item) {
          <p class="mb-3">
            <strong>{{ item.subject || '(no subject)' }}</strong><br />
            <span class="text-color-secondary">{{ people(item) }}</span>
          </p>
          <div class="file-form">
            <p-selectbutton
              [options]="kindOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="kind"
              [allowEmpty]="false"
              (onChange)="targetId = null"
            />
            <p-select
              [options]="kind === 'client' ? orgOptions() : leads()"
              optionLabel="label"
              optionValue="id"
              [(ngModel)]="targetId"
              [filter]="true"
              filterBy="label"
              filterPlaceholder="Search…"
              [showClear]="true"
              [placeholder]="kind === 'client' ? 'Choose an organization' : 'Choose a pipeline card'"
              [ariaLabel]="kind === 'client' ? 'Organization' : 'Pipeline card'"
              styleClass="w-full"
              appendTo="body"
            />
            @if (kind === 'client') {
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="learn" [(ngModel)]="learn" [binary]="true" />
                <label for="learn">Link the people on this email to the organization</label>
              </div>
            }
            @if (fileError()) {
              <p-message severity="error" [text]="fileError()!" />
            }
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="fileVisible = false" />
          <p-button label="File" icon="pi pi-check" [loading]="saving()" [disabled]="!targetId" (onClick)="saveFile()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `
    .activity-page-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .activity-page-filters, .all-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .all-filters { margin-bottom: 1rem; }
    .activity-filter-field { width: 16rem; max-width: 100%; margin: 0; }
    .activity-context { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem 1rem; margin-bottom: 1rem; border: 1px solid var(--surface-border, #e5e7eb); border-radius: 0.5rem; }
    .activity-context-title { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
    .activity-context-name { font-size: 1.15rem; font-weight: 600; text-decoration: none; }
    .activity-context-back { margin-left: auto; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; }
    .activity-context-people { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
    .activity-count { display: inline-block; min-width: 1.25rem; margin-left: 0.4rem; padding: 0 0.4rem; border-radius: 0.75rem; background: #fee2e2; color: #991b1b; font-weight: 600; text-align: center; }
    .todo-toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
    .queue-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    @media (max-width: 900px) { .queue-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .queue-card { display: flex; flex-direction: column; gap: 0.35rem; text-align: left; padding: 0.75rem 1rem; border: 1px solid var(--surface-border, #e5e7eb); border-radius: 0.5rem; background: var(--surface-0, #fff); cursor: pointer; font: inherit; color: inherit; min-width: 0; }
    .queue-card--active { border: 2px solid #2563eb; padding: calc(0.75rem - 1px) calc(1rem - 1px); }
    .queue-card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .queue-card-label { font-weight: 600; }
    .queue-card-count { min-width: 1.5rem; padding: 0 0.5rem; border-radius: 0.75rem; background: #fee2e2; color: #991b1b; font-weight: 700; text-align: center; }
    .queue-card-count--zero { background: var(--surface-100, #f3f4f6); color: var(--text-color-secondary, #4b5563); }
    .queue-card-help { color: var(--text-color-secondary, #4b5563); }
    .text-overdue { color: #b91c1c; font-weight: 600; }
    .file-form { display: flex; flex-direction: column; gap: 1rem; }
    .clickable-row { cursor: pointer; }
    .person-line { display: flex; gap: 0.5rem; min-width: 0; }
    .person-label { flex: 0 0 2.5rem; color: var(--text-color-secondary); }
    .person-value { min-width: 0; overflow-wrap: anywhere; }
    .person-list { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; }
    .person-tag { display: inline-block; margin-top: 0.35rem; }
    .skeleton-list { display: flex; flex-direction: column; gap: 0.75rem; }
  `,
})
export class ActivityPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly peopleLoader = inject(PeoplePickerLoader);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.queryParamMap.pipe(map((p) => p)), { initialValue: this.route.snapshot.queryParamMap });

  readonly tab = computed<Tab>(() => (this.params().get('tab') === 'all' ? 'all' : 'todo'));
  readonly orgId = computed(() => this.params().get('organization') || null);
  readonly personId = computed(() => this.params().get('person') || null);
  readonly personPickId = computed(() => (this.personId() ? `contact:${this.personId()}` : null));
  readonly queue = computed<QueueKey>(() => {
    const q = this.params().get('queue');
    return q === 'nextStep' || q === 'quiet' || q === 'unfiled' ? q : 'reply';
  });

  readonly info = QUEUE_INFO;
  readonly queueKeys: QueueKey[] = ['reply', 'nextStep', 'quiet', 'unfiled'];
  readonly scopeOptions = [
    { label: 'Mine', value: true },
    { label: "Everyone's", value: false },
  ];

  orgs = signal<Org[]>([]);
  peopleOptions = signal<PeopleDirectoryOption[]>([]);
  peopleLoading = signal(false);
  team = signal<Option[]>([]);
  leads = signal<Option[]>([]);
  readonly orgOptions = computed(() => this.orgs().map((o) => ({ id: o.id, label: o.name })));
  readonly org = computed(() => {
    const id = this.orgId();
    return id ? this.orgs().find((o) => o.id === id) ?? { id, name: 'Organization' } : null;
  });
  orgPeople = signal<ContactSummary[]>([]);
  person = signal<ContactSummary | null>(null);

  mine = signal(true);
  queues = signal<ActivityQueues | null>(null);
  queuesLoading = signal(false);
  queuesError = signal<string | null>(null);
  readonly thresholds = computed(() => this.queues()?.thresholds ?? { needsReplyDays: 2, goneQuietDays: 30 });
  readonly unfiled = computed(() => this.queues()?.unfiled ?? []);
  readonly queueRows = computed<QueueRow[]>(() => {
    const q = this.queues();
    if (!q) return [];
    const key = this.queue();
    return key === 'reply' ? q.reply : key === 'nextStep' ? q.nextStep : key === 'quiet' ? q.quiet : [];
  });
  readonly todoTotal = computed(() => {
    const c = this.queues()?.counts;
    return c ? c.reply + c.nextStep + c.unfiled : 0;
  });

  loggedBy = signal<string | null>(null);
  from = signal('');
  to = signal('');
  readonly feedFilter = computed<ActivityFeedFilter>(() => ({
    loggedByUserId: this.loggedBy(),
    from: startOfDayIso(this.from()),
    to: endOfDayIso(this.to()),
  }));

  // File dialog (Unfiled)
  fileVisible = false;
  active = signal<Interaction | null>(null);
  kind: 'client' | 'lead' = 'client';
  targetId: string | null = null;
  learn = true;
  saving = signal(false);
  fileError = signal<string | null>(null);
  readonly kindOptions = [
    { label: 'Organization', value: 'client' },
    { label: 'Pipeline card', value: 'lead' },
  ];

  readonly sendersOf = senderAndRecipients;
  rel = relativeTime;
  dir = directionLabel;
  people = (i: Interaction) => participantLine(i);

  constructor() {
    effect(() => {
      const mine = this.mine();
      const clientId = this.orgId();
      const contactId = clientId ? null : this.personId();
      this.comms.activityChanged();
      untracked(() => void this.loadQueues(mine, clientId, contactId));
    });
    effect(() => {
      const clientId = this.orgId();
      untracked(() => void this.loadOrgPeople(clientId));
    });
    effect(() => {
      const contactId = this.personId();
      untracked(() => void this.loadPerson(contactId));
    });
  }

  async ngOnInit() {
    this.peopleLoading.set(true);
    const [orgs, people, team] = await Promise.all([
      this.api.get<Org[]>('/clients').catch(() => [] as Org[]),
      this.peopleLoader.loadCrmContacts().catch(() => [] as PeopleDirectoryOption[]),
      this.comms.team().catch(() => [] as TeamMember[]),
    ]);
    this.orgs.set([...orgs].sort((a, b) => a.name.localeCompare(b.name)));
    this.peopleOptions.set(people);
    this.peopleLoading.set(false);
    this.team.set(team.map((u) => ({ id: u.id, label: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email })));
  }

  private navigate(params: Record<string, string | null>) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setTab(value: string | number | undefined) {
    this.navigate({ tab: value === 'all' ? 'all' : null });
  }

  setQueue(q: QueueKey) {
    this.navigate({ queue: q === 'reply' ? null : q });
  }

  setOrg(id: string | null) {
    this.navigate({ organization: id || null, person: null });
  }

  setPerson(pickId: string | null) {
    this.navigate({ person: contactIdFromDirectoryId(pickId), organization: null });
  }

  countOf(q: QueueKey): number {
    const c = this.queues()?.counts;
    if (!c) return 0;
    return c[q];
  }

  personLabel(p: ContactSummary): string {
    return contactName(p);
  }

  whenHeader(): string {
    const q = this.queue();
    return q === 'reply' ? 'Waiting since' : q === 'nextStep' ? 'Due' : 'Last contact';
  }

  whenLabel(row: QueueRow): string {
    if (!row.at) return row.queue === 'NEXT_STEP' ? 'No date' : 'Never';
    const d = new Date(row.at);
    if (row.queue === 'REPLY') {
      const days = Math.floor((Date.now() - d.getTime()) / DAY);
      return `${days} day${days === 1 ? '' : 's'} (${relativeTime(row.at)})`;
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  private async loadQueues(mine: boolean, clientId: string | null, contactId: string | null) {
    this.queuesLoading.set(true);
    this.queuesError.set(null);
    try {
      this.queues.set(await this.comms.queues({ mine, clientId, contactId }));
    } catch (err) {
      this.queuesError.set(err instanceof Error ? err.message : 'Could not load To do');
    } finally {
      this.queuesLoading.set(false);
    }
  }

  private async loadOrgPeople(clientId: string | null) {
    this.orgPeople.set(clientId ? await this.comms.contacts({ clientId }).catch(() => [] as ContactSummary[]) : []);
  }

  private async loadPerson(contactId: string | null) {
    this.person.set(contactId ? await this.comms.contact(contactId).catch(() => null) : null);
  }

  /** Narrow the page to this row's organization: the next step and quick log are right there. */
  private workOn(row: QueueRow) {
    if (row.clientId) this.navigate({ organization: row.clientId, person: null });
  }

  private async snooze(row: QueueRow, days: number | null, done: string) {
    try {
      const until = days === null ? null : new Date(Date.now() + days * DAY).toISOString();
      await this.comms.snooze(row.queue, row.refKey, until);
      this.toast.add({ severity: 'success', summary: done, detail: row.clientName ?? row.title });
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not update', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  rowActions(row: QueueRow): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (row.queue === 'REPLY') {
      if (row.clientId) {
        actions.push({ id: 'thread', label: 'Open timeline', icon: 'pi pi-comments', command: () => this.navigate({ tab: 'all', organization: row.clientId, person: null }) });
      }
      actions.push({ id: 'done', label: 'No reply needed', icon: 'pi pi-check', command: () => void this.snooze(row, null, 'Cleared') });
      actions.push({ id: 'snooze', label: 'Snooze 3 days', icon: 'pi pi-clock', command: () => void this.snooze(row, 3, 'Snoozed') });
    } else if (row.queue === 'NEXT_STEP') {
      if (row.leadId) {
        actions.push({ id: 'card', label: 'Open pipeline card', icon: 'pi pi-external-link', command: () => void this.router.navigate(['/pipeline', row.leadId]) });
      } else if (row.clientId) {
        actions.push({ id: 'work', label: 'Work on it', icon: 'pi pi-flag', command: () => this.workOn(row) });
      }
      actions.push({ id: 'snooze', label: 'Snooze 1 week', icon: 'pi pi-clock', command: () => void this.snooze(row, 7, 'Snoozed') });
    } else {
      actions.push({ id: 'work', label: 'Work on it', icon: 'pi pi-flag', command: () => this.workOn(row) });
      actions.push({ id: 'snooze', label: 'Snooze 30 days', icon: 'pi pi-clock', command: () => void this.snooze(row, 30, 'Snoozed') });
    }
    return actions;
  }

  unfiledActions(item: Interaction): RowActionItem[] {
    return [{ id: 'file', label: 'File…', icon: 'pi pi-folder', command: () => void this.openFile(item) }];
  }

  async openFile(item: Interaction) {
    this.active.set(item);
    this.kind = 'client';
    this.targetId = null;
    this.learn = true;
    this.fileError.set(null);
    this.fileVisible = true;
    if (this.leads().length === 0) {
      const leads = await this.api.get<{ id: string; organization: string }[]>('/leads').catch(() => []);
      this.leads.set(leads.map((l) => ({ id: l.id, label: l.organization })));
    }
  }

  async saveFile() {
    const item = this.active();
    if (!item || !this.targetId) return;
    this.saving.set(true);
    this.fileError.set(null);
    try {
      const res = await this.comms.file(item.id, this.kind === 'client' ? { clientId: this.targetId, learn: this.learn } : { leadId: this.targetId });
      this.fileVisible = false;
      const parts = ['Filed.'];
      if (res.threadItemsFiled) parts.push(`${res.threadItemsFiled} more from the same thread filed too.`);
      if (res.contactsLinked) parts.push(`Linked ${res.contactsLinked} contact${res.contactsLinked === 1 ? '' : 's'} to the organization.`);
      this.toast.add({ severity: 'success', summary: 'Filed', detail: parts.join(' ') });
      void this.comms.refreshUnfiledCount();
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.fileError.set(err instanceof Error ? err.message : 'Filing failed');
    } finally {
      this.saving.set(false);
    }
  }
}
