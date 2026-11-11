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
import { FormsApi } from '../../core/forms.api';
import { SessionService } from '../../core/session.service';
import { areaLevel } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import {
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
} from '../../core/communications.api';
import { contactIdFromDirectoryId, PeoplePickerLoader } from '../../core/people-picker.loader';
import { PeopleDirectoryOption, toDirectoryOptions } from '../projects/people-directory.util';
import { ActivitySectionComponent } from '../../ui/activity/activity-section.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { PageComponent } from '../../ui/layout/page.component';
import { MessageBodyComponent } from '../../ui/message-body/message-body.component';
import { NextStepComponent } from '../../ui/next-step/next-step.component';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { PeopleComponent } from '../../ui/people/people.component';
import { PersonComponent } from '../../ui/person/person.component';
import { QueueCardComponent } from '../../ui/queue-card/queue-card.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { TagChipListComponent } from '../../ui/tag-input/tag-chip-list.component';
type Tab = 'todo' | 'all';
type QueueKey = 'reply' | 'nextStep' | 'quiet' | 'unfiled';
type Org = { id: string; name: string; journey?: 'PROSPECT' | 'CLIENT' | 'NONE'; isActive?: boolean };
type Option = { id: string; label: string };
type OrgDetail = {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  notes: string | null;
  journey: 'PROSPECT' | 'CLIENT' | 'NONE';
  isActive: boolean;
  lastContactAt: string | null;
  tags?: string[];
};

const DAY = 24 * 60 * 60 * 1000;

/** CRM contacts from `/contacts` → options for `app-people-select` (same shape as directory search). */
function contactSummariesToPeopleOptions(contacts: ContactSummary[]): PeopleDirectoryOption[] {
  const entries = contacts.map((c) => {
    const firstName = (c.firstName ?? '').trim();
    const lastName = (c.lastName ?? '').trim();
    const primary = c.emails?.find((e) => e.isPrimary) ?? c.emails?.[0];
    const email = primary?.email?.trim() ?? '';
    return {
      id: `contact:${c.id}`,
      source: 'CONTACT',
      sourceLabel: 'Contact',
      firstName,
      lastName,
      email,
      phone: (c.phone ?? '').trim(),
      displayName: contactName({ firstName, lastName }).trim() || email || 'Contact',
      avatarUrl: c.avatarUrl ?? null,
    };
  });
  return toDirectoryOptions(entries);
}

const QUEUE_INFO: Record<QueueKey, { label: string; help: (t: ActivityQueues['thresholds']) => string }> = {
  reply: { label: 'Needs reply', help: (t) => `They wrote last and nobody has answered in ${t.needsReplyDays}+ day${t.needsReplyDays === 1 ? '' : 's'}.` },
  nextStep: { label: 'Next steps', help: () => 'Every next step that is set, soonest first. Overdue ones are tagged.' },
  quiet: { label: 'Gone quiet', help: (t) => `Active clients with no contact in ${t.goneQuietDays}+ days.` },
  unfiled: { label: 'Unfiled', help: () => "Captured email that couldn't be matched to one organization." },
};

/**
 * Activity: All activity across organizations (default tab), and To do (Needs reply, Next steps, Gone quiet, Unfiled).
 * URL: omit `tab` (or `tab=all`) for All activity; `tab=todo` (legacy `tab=inbox`) for To do. A `queue` without `tab` implies To do.
 * Optionally narrowed to one organization or person. Record pages link here with "Open full view".
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
    ActivitySectionComponent,
    MessageBodyComponent,
    NextStepComponent,
    PeopleSelectComponent,
    PeopleComponent,
    PersonComponent,
    QueueCardComponent,
    TagChipListComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page title="Activity" helpKey="activity.page">
      <ng-container ngProjectAs="[pageActions]">
        <div class="activity-header-filters">
          <div class="form-field activity-header-filter">
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
              [fluid]="true"
              styleClass="w-full"
            />
          </div>
          <div class="form-field activity-header-filter">
            <label for="activityPerson">Person</label>
            <app-people-select
              inputId="activityPerson"
              [options]="personFilterOptions()"
              [loading]="personFilterLoading()"
              [pickId]="personPickId()"
              (pickIdChange)="setPerson($event)"
              placeholder="All people"
            />
          </div>
        </div>
      </ng-container>
      <div class="grid" [class.grid-3]="hasContext()" [class.grid-1]="!hasContext()">
      <div class="stack" [class.span-2]="hasContext()">
      <div class="card">
        <p-tabs [value]="tab()" (valueChange)="setTab($event)" class="activity-tabs">
          <p-tablist>
            <p-tab value="all">All activity</p-tab>
            <p-tab value="todo">To do @if (todoTotal()) { <span class="activity-count">{{ todoTotal() }}</span> }</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="all">
              <app-activity-section
                [wrapCard]="false"
                [global]="true"
                [clientId]="orgId()"
                [contactId]="personId()"
                [organizationName]="org()?.name ?? undefined"
                [showNextActionOnQuickLog]="!!orgId() && !personId()"
              />
            </p-tabpanel>
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
                  <app-queue-card [label]="info[q].label" [count]="countOf(q)" [help]="info[q].help(thresholds())" [active]="queue() === q" (pick)="setQueue(q)" />
                }
                @if (canForms()) {
                  <app-queue-card label="Form submissions" [count]="pendingSubmissions()" help="Waiting for review in Forms." link="/forms" />
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
                @if (!queueRows().length) {
                  <div class="empty-state"><i class="pi pi-check-circle" aria-hidden="true"></i><p>Nothing here. You're all caught up.</p></div>
                } @else {
                  <div class="activity-todo-register" role="region" [attr.aria-label]="info[queue()].label + ' queue'">
                    <div class="activity-todo-register-head" role="row">
                      <span class="activity-todo-col-actions" aria-hidden="true"></span>
                      <span class="activity-todo-head-label">Organization / person</span>
                      <span class="activity-todo-head-label">Why it's here</span>
                      <span class="activity-todo-head-label">{{ whenHeader() }}</span>
                      <span class="activity-todo-head-label">Owner</span>
                    </div>
                    <div class="side-list activity-todo-list">
                      @for (row of queueRows(); track row.refKey) {
                        <div class="side-list-row activity-todo-row">
                          <div class="activity-todo-col-actions">
                            <app-row-actions-menu [items]="rowActions(row)" ariaLabel="To do actions" />
                          </div>
                          <div class="side-list-body activity-todo-col-org">
                            @if (row.leadId) {
                              <a [routerLink]="['/pipeline', row.leadId]" class="side-list-title">{{ row.clientName || 'Pipeline card' }}</a>
                              <span class="side-list-detail">Pipeline card</span>
                            } @else if (row.clientId) {
                              <a [routerLink]="['/organizations', row.clientId]" class="side-list-title">{{ row.clientName }}</a>
                            } @else {
                              <span class="side-list-title">—</span>
                            }
                            @if (row.person) {
                              <span class="side-list-detail">
                                @if (row.contactId) { <a [routerLink]="['/people', row.contactId]">{{ row.person }}</a> } @else { {{ row.person }} }
                              </span>
                            }
                          </div>
                          <div class="activity-todo-col-reason">
                            <span class="side-list-detail activity-todo-reason-text">{{ row.title }}</span>
                            @if (row.overdue) {
                              <p-tag value="Overdue" severity="danger" styleClass="activity-todo-status-tag" />
                            } @else if (row.dueToday) {
                              <p-tag value="Due today" severity="warn" styleClass="activity-todo-status-tag" />
                            }
                          </div>
                          <span
                            class="side-list-value activity-todo-col-when"
                            [class.side-list-value--overdue]="row.overdue"
                            [class.side-list-value--today]="row.dueToday && !row.overdue"
                          >{{ whenLabel(row) }}</span>
                          <span class="side-list-value side-list-value--strong activity-todo-col-owner">{{ row.owner || '—' }}</span>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </div>
      </div>

      @if (hasContext()) {
        <aside class="side-panel-stack" aria-label="Details">
          @if (org(); as o) {
            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Next action</h3>
                @if (orgNextActionTag(); as tag) {
                  <p-tag [value]="tag.label" [severity]="tag.severity" />
                }
              </div>
              <div class="side-panel-scroll">
                <app-next-step
                  [clientId]="o.id"
                  variant="panel"
                  [showInlineStatus]="false"
                  (headerStatus)="onOrgNextStepHeaderStatus($event)"
                />
              </div>
            </div>

            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Details</h3>
              </div>
              <div class="side-panel-scroll">
              <div class="side-name">
                <a [routerLink]="['/organizations', o.id]">{{ orgDetail()?.name ?? o.name }}</a>
                @if (orgDetail(); as d) {
                  @if (d.journey === 'CLIENT') {
                    <p-tag [value]="d.isActive === false ? 'Client · Inactive' : 'Client · Active'" [severity]="d.isActive === false ? 'secondary' : 'success'" />
                  } @else if (d.journey === 'PROSPECT') {
                    <p-tag value="Prospect" severity="info" />
                  }
                }
              </div>
              @if (orgDetail(); as d) {
                <dl class="side-details">
                  @if (d.tags?.length) {
                    <div><dt>Tags</dt><dd><app-tag-chip-list [tags]="d.tags!" /></dd></div>
                  }
                  @if (d.phone) { <div><dt>Phone</dt><dd><a [href]="'tel:' + d.phone">{{ d.phone }}</a></dd></div> }
                  @if (d.email) { <div><dt>Email</dt><dd><a [href]="'mailto:' + d.email">{{ d.email }}</a></dd></div> }
                  @if (d.website) { <div><dd><a [href]="websiteHref(d.website)" target="_blank" rel="noopener">{{ d.website }}</a></dd></div> }
                  @if (addressOf(d); as addr) { <div><dt>Address</dt><dd class="pre-line">{{ addr }}</dd></div> }
                  <div class="side-inline"><dt>Last contact:</dt><dd>{{ d.lastContactAt ? rel(d.lastContactAt) : 'None logged' }}</dd></div>
                </dl>
                @if (d.notes) {
                  <div class="side-notes">{{ plain(d.notes) }}</div>
                }
              }
              </div>
            </div>

            <app-people mode="organization" [clientId]="o.id" [compact]="true" [readOnly]="true" />
          } @else if (person(); as p) {
            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Details</h3>
              </div>
              <div class="side-panel-scroll">
              <div class="side-name"><a [routerLink]="['/people', p.id]">{{ personLabel(p) }}</a></div>
              <dl class="side-details">
                @if (p.title) { <div><dt>Title</dt><dd>{{ p.title }}</dd></div> }
                @for (e of p.emails; track e.id) { <div><dt>{{ e.isPrimary ? 'Email' : 'Other email' }}</dt><dd><a [href]="'mailto:' + e.email">{{ e.email }}</a></dd></div> }
                @if (p.phone) { <div><dt>Phone</dt><dd><a [href]="'tel:' + p.phone">{{ p.phone }}</a></dd></div> }
                @if (p.tags.length) {
                  <div><dt>Tags</dt><dd><app-tag-chip-list [tags]="p.tags" /></dd></div>
                }
                <div class="side-inline"><dt>Last contact:</dt><dd>{{ p.lastContactAt ? rel(p.lastContactAt) : 'None logged' }}</dd></div>
              </dl>
              @if (p.notes) {
                <div class="side-notes">{{ plain(p.notes) }}</div>
              }
              </div>
            </div>

            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Organizations</h3>
              </div>
              <div class="side-panel-scroll">
              @for (l of p.accountLinks; track l.clientId) {
                <div class="side-row">
                  <a [routerLink]="['/organizations', l.clientId]">{{ l.client.name }}</a>
                  @if (l.role) { <div class="text-color-secondary">{{ l.role }}</div> }
                </div>
                <app-next-step [clientId]="l.clientId" variant="panel" class="side-next-step" />
              } @empty {
                <p class="text-color-secondary mb-0">Not linked to an organization.</p>
              }
              </div>
            </div>
          }
        </aside>
      }
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
    /* Tab content flush left with the page title (PrimeNG pads tab panels on every side). */
    :host ::ng-deep .activity-tabs .p-tabpanels { padding: 1rem 0 0; }
    .side-name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; font-weight: 600; }
    .side-name a { text-decoration: none; }
    .side-details { margin: 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .side-details dt { color: var(--text-color-secondary, #6b7280); }
    .side-details dd { margin: 0; overflow-wrap: anywhere; }
    .side-inline { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .side-notes { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--surface-border, #e5e7eb); white-space: pre-line; }
    .side-row { padding: 0.4rem 0; }
    .side-next-step { display: block; margin: 0.25rem 0 0.6rem; }
    .pre-line { white-space: pre-line; }
    .activity-count { display: inline-block; min-width: 1.25rem; margin-left: 0.4rem; padding: 0 0.4rem; border-radius: 0.75rem; background: #fee2e2; color: #991b1b; font-weight: 600; text-align: center; }
    .todo-toolbar { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
    /* To do queue list: same register pattern as Expenses (grid rows + side-list tokens). */
    .activity-todo-register { margin-top: 0.5rem; }
    .activity-todo-register-head,
    .activity-todo-row {
      display: grid;
      grid-template-columns: 2rem minmax(10rem, 1.1fr) minmax(0, 2fr) 6.75rem 7.5rem;
      align-items: start;
      gap: 0.5rem 0.75rem;
    }
    .activity-todo-register-head {
      margin-bottom: 0.5rem;
      padding: 0.5rem 0.65rem;
      border-radius: var(--content-border-radius, 6px);
      background: var(--surface-100, #f3f4f6);
      border-bottom: 1px solid var(--surface-border);
    }
    .activity-todo-head-label {
      font-size: var(--fs-sm);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--text-color-secondary, #6b7280);
    }
    .activity-todo-col-actions {
      width: 2rem;
      margin-top: 0.1rem;
    }
    .activity-todo-list.side-list {
      gap: 0;
    }
    .activity-todo-row.side-list-row {
      align-items: start;
      padding: 0.65rem 0.5rem;
      border-radius: var(--content-border-radius, 6px);
      margin-inline: -0.5rem;
      border-top: 1px solid var(--surface-border);
    }
    .activity-todo-row.side-list-row:first-child {
      border-top: 0;
      padding-top: 0.5rem;
    }
    @media (max-width: 900px) {
      .activity-todo-register-head {
        display: none;
      }
      .activity-todo-row.side-list-row {
        grid-template-columns: 2rem 1fr;
        grid-template-areas:
          'actions org'
          'actions reason'
          'actions when'
          'actions owner';
      }
      .activity-todo-col-actions {
        grid-area: actions;
      }
      .activity-todo-col-org {
        grid-area: org;
      }
      .activity-todo-col-reason {
        grid-area: reason;
      }
      .activity-todo-col-when {
        grid-area: when;
      }
      .activity-todo-col-owner {
        grid-area: owner;
      }
    }
    .activity-todo-row.side-list-row:hover {
      background: color-mix(in srgb, var(--surface-hover, #f4f4f5) 80%, transparent);
    }
    .activity-todo-col-org .side-list-title {
      font-size: var(--fs-base);
    }
    .activity-todo-col-reason {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 0;
    }
    .activity-todo-reason-text {
      line-height: 1.4;
    }
    .activity-todo-col-when,
    .activity-todo-col-owner {
      margin-left: 0;
      text-align: left;
      white-space: normal;
      word-break: break-word;
    }
    :host ::ng-deep .activity-todo-status-tag.p-tag {
      width: fit-content;
    }
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
  private readonly formsApi = inject(FormsApi);
  private readonly session = inject(SessionService);
  /** Forms submissions waiting for review (a To do card that opens Forms). */
  readonly canForms = computed(() => !!areaLevel(this.session.me(), 'forms'));
  readonly pendingSubmissions = signal(0);

  private readonly params = toSignal(this.route.queryParamMap.pipe(map((p) => p)), { initialValue: this.route.snapshot.queryParamMap });

  readonly tab = computed<Tab>(() => {
    const t = this.params().get('tab');
    if (t === 'todo' || t === 'inbox') return 'todo';
    if (t === 'all') return 'all';
    // Legacy bookmark: queue without tab still opens To do.
    if (this.params().get('queue')) return 'todo';
    return 'all';
  });
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
  /** Tenant-wide CRM people (when no organization filter). */
  allPeopleOptions = signal<PeopleDirectoryOption[]>([]);
  peopleLoading = signal(false);
  /** True while loading org contacts for the Activity header person filter. */
  orgContactsLoading = signal(false);
  leads = signal<Option[]>([]);
  readonly orgOptions = computed(() => this.orgs().map((o) => ({ id: o.id, label: o.name })));
  readonly org = computed(() => {
    const id = this.orgId();
    return id ? this.orgs().find((o) => o.id === id) ?? { id, name: 'Organization' } : null;
  });
  orgPeople = signal<ContactSummary[]>([]);
  orgDetail = signal<OrgDetail | null>(null);
  /** Overdue / Due today in the Next action panel header (organization context). */
  orgNextActionTag = signal<{ label: string; severity: 'danger' | 'warn' } | null>(null);
  readonly hasContext = computed(() => !!this.orgId() || !!this.personId());
  person = signal<ContactSummary | null>(null);

  /** Person filter: all CRM people, or only people linked to the selected organization. */
  readonly personFilterOptions = computed(() =>
    this.orgId() ? contactSummariesToPeopleOptions(this.orgPeople()) : this.allPeopleOptions(),
  );

  readonly personFilterLoading = computed(() => this.peopleLoading() || this.orgContactsLoading());

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
    return c ? c.reply + c.nextStepDue + c.unfiled : 0;
  });

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
      untracked(() => {
        this.orgNextActionTag.set(null);
        void this.loadOrgPeople(clientId);
      });
    });
    effect(() => {
      const contactId = this.personId();
      untracked(() => void this.loadPerson(contactId));
    });
  }

  async ngOnInit() {
    if (this.canForms()) this.formsApi.pending().then((r) => this.pendingSubmissions.set(r.length), () => this.pendingSubmissions.set(0));
    this.peopleLoading.set(true);
    const [orgs, people] = await Promise.all([
      this.api.get<Org[]>('/clients').catch(() => [] as Org[]),
      this.peopleLoader.loadCrmContacts().catch(() => [] as PeopleDirectoryOption[]),
    ]);
    this.orgs.set([...orgs].sort((a, b) => a.name.localeCompare(b.name)));
    this.allPeopleOptions.set(people);
    this.peopleLoading.set(false);
  }

  private navigate(params: Record<string, string | null>) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setTab(value: string | number | undefined) {
    const next: 'all' | 'todo' = value === 'todo' ? 'todo' : 'all';
    if (next === 'all') {
      // All activity is the default URL; clear queue so a stale To do queue does not linger.
      this.navigate({ tab: null, queue: null });
    } else {
      this.navigate({ tab: 'todo' });
    }
  }

  setQueue(q: QueueKey) {
    this.navigate({ tab: 'todo', queue: q === 'reply' ? null : q });
  }

  setOrg(id: string | null) {
    this.orgNextActionTag.set(null);
    this.navigate({ organization: id || null, person: null });
  }

  onOrgNextStepHeaderStatus(tag: { label: string; severity: 'danger' | 'warn' } | null) {
    this.orgNextActionTag.set(tag);
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
    if (!clientId) {
      this.orgContactsLoading.set(false);
      this.orgPeople.set([]);
      this.orgDetail.set(null);
      return;
    }
    this.orgContactsLoading.set(true);
    this.orgPeople.set([]);
    try {
      const [people, detail] = await Promise.all([
        this.comms.contacts({ clientId }).catch(() => [] as ContactSummary[]),
        this.api.get<OrgDetail>(`/clients/${clientId}`).catch(() => null),
      ]);
      this.orgPeople.set(people);
      this.orgDetail.set(detail);
    } finally {
      this.orgContactsLoading.set(false);
    }
  }

  addressOf(d: OrgDetail): string | null {
    const cityLine = [[d.city, d.state].filter(Boolean).join(', '), d.zip].filter(Boolean).join(' ');
    return [d.address, cityLine].filter(Boolean).join('\n') || null;
  }

  websiteHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  /** Notes may be formatted (Quill); show them as plain text here. */
  plain(value: string): string {
    return value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
        actions.push({
          id: 'thread',
          label: 'Open timeline',
          icon: 'pi pi-comments',
          command: () => this.navigate({ tab: null, queue: null, organization: row.clientId, person: null }),
        });
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
