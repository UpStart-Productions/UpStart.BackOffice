import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
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
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormsApi } from '../../core/forms.api';
import { PipelinesApi } from '../../core/pipelines.api';
import { personCardInnerHtml } from '../../core/quill-person-card-render';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SessionService } from '../../core/session.service';
import { LIST_VIEW_KEYS, listViewFilterBool, listViewFilterString, patchListViewPrefs, readListViewPrefs } from '../../core/list-view-prefs.storage';
import { saveListFilter } from '../../core/list-view-prefs.util';
import { areaLevel, type PendingSubmissionDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import {
  ActivityQueues,
  CommunicationsApi,
  ContactSummary,
  contactName,
  Interaction,
  QueueRow,
  relativeTime,
  senderAndRecipients,
  interactionIcon,
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
type QueueKey = 'unfiled' | 'forms' | 'nextStep' | 'quiet';
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
  forms: { label: 'Form submissions', help: () => 'Submissions waiting for review. Click one to review it.' },
  nextStep: { label: 'Next steps', help: () => 'Every next step that is set, soonest first. Overdue ones are tagged.' },
  quiet: { label: 'Gone quiet', help: (t) => `Active clients with no contact in ${t.goneQuietDays}+ days.` },
  unfiled: { label: 'Unfiled', help: () => "Captured email that couldn't be matched to one account." },
};

/**
 * Activity: All activity across accounts (default tab), and To do (Unfiled, Form submissions, Next steps, Gone quiet).
 * URL: omit `tab` (or `tab=all`) for All activity; `tab=todo` (legacy `tab=inbox`) for To do. A `queue` without `tab` implies To do.
 * Optionally narrowed to one account or person. Record pages link here with "Open full view".
 */
@Component({
  selector: 'app-activity-page',
  standalone: true,
  imports: [
    InputTextModule,
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
            <label for="activityOrg">Account</label>
            <p-select
              inputId="activityOrg"
              [options]="orgFilterOptions()"
              optionLabel="name"
              optionValue="id"
              [ngModel]="orgFilterValue()"
              (ngModelChange)="setOrg($event)"
              [filter]="true"
              filterBy="name"
              filterPlaceholder="Search…"
              [showClear]="true"
              placeholder="All accounts"
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
                [leadId]="cardId()"
                [contactId]="personId()"
                [organizationName]="org()?.name ?? undefined"
                [showNextActionOnQuickLog]="!!orgId() && !personId()"
                [infiniteScroll]="!cardId()"
                [pageSize]="5"
              />
            </p-tabpanel>
            <p-tabpanel value="todo">
              <div class="todo-toolbar">
                <p-selectbutton
                  [options]="scopeOptions"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="mine()"
                  (ngModelChange)="setMine($event)"
                  [allowEmpty]="false"
                  ariaLabel="Whose items"
                />
              </div>

              @if (queuesError()) {
                <p-message severity="error" [text]="queuesError()!" styleClass="mb-3" />
              }

              <div class="queue-grid">
                @for (q of queueKeys(); track q) {
                  <app-queue-card [label]="info[q].label" [count]="countOf(q)" [help]="info[q].help(thresholds())" [active]="queue() === q" (pick)="setQueue(q)" />
                }
              </div>

              @if (queuesLoading() && !queues()) {
                <div class="skeleton-list" aria-busy="true">
                  @for (n of [1, 2, 3]; track n) { <p-skeleton height="2.5rem" /> }
                </div>
              } @else if (queue() === 'forms') {
                <p-table [value]="submissions()" styleClass="table-bordered" dataKey="id">
                  <ng-template pTemplate="header">
                    <tr>
                      <th style="width: 10rem">Submitted</th>
                      <th style="width: 20rem">From</th>
                      <th>Form</th>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-p>
                    <tr>
                      <td><span [title]="(p.createdAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(p.createdAt) }}</span></td>
                      <td>
                        <a [routerLink]="['/forms/submissions', p.id]" [queryParams]="{ from: 'activity' }">{{ p.submitterName ?? p.submitterEmail ?? 'Anonymous' }}</a>
                        @if (p.submitterName && p.submitterEmail) {
                          <div class="text-color-secondary">{{ p.submitterEmail }}</div>
                        }
                      </td>
                      <td>{{ p.formName }}</td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="3" class="text-color-secondary">Nothing waiting for review.</td></tr>
                  </ng-template>
                </p-table>
              } @else if (queue() === 'unfiled') {
                @if (!unfiled().length) {
                  <div class="empty-state">
                    <i class="pi pi-inbox" aria-hidden="true"></i>
                    <p>Nothing to file.</p>
                  </div>
                }
                @for (item of unfiled(); track item.id) {
                  @let ppl = sendersOf(item);
                  <div class="activity-item">
                    <div class="activity-item-actions">
                      <app-row-actions-menu [items]="unfiledActions(item)" ariaLabel="Unfiled message actions" />
                    </div>
                    <div class="activity-icon activity-icon--{{ item.type }}" [attr.aria-label]="item.type" role="img">
                      <i class="pi {{ icon(item.type) }}" aria-hidden="true"></i>
                    </div>
                    <div class="activity-body">
                      <div class="activity-head">
                        <span class="activity-when">
                          <span class="activity-date" [title]="(item.occurredAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(item.occurredAt) }}</span>
                        </span>
                        @if (item.subject?.trim(); as subj) {
                          <strong class="activity-subject">{{ subj }}</strong>
                        }
                      </div>
                      <div class="activity-meta">
                        @if (ppl.from) {
                          <app-person [name]="ppl.from.name" [email]="ppl.from.email" [avatarUrl]="ppl.from.avatarUrl" [personId]="ppl.from.contactId ?? ppl.from.userId ?? ppl.from.email" size="sm" />
                        }
                        @if (ppl.from && ppl.to.length) { <i class="pi pi-arrow-right activity-arrow" aria-label="to"></i> }
                        @for (p of ppl.to; track p.email) {
                          <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" size="sm" />
                        }
                        @if (item.captures.length) {
                          <span>· captured by {{ item.captures[0].capturedByEmail }}</span>
                        }
                      </div>
                      <app-message-body [item]="item" />
                    </div>
                  </div>
                }
              } @else {
                @if (!queueRows().length) {
                  <div class="empty-state"><i class="pi pi-check-circle" aria-hidden="true"></i><p>Nothing here. You're all caught up.</p></div>
                } @else {
                  <div class="activity-todo-register" role="region" [attr.aria-label]="info[queue()].label + ' queue'">
                    <div class="activity-todo-register-head" role="row">
                      <span class="activity-todo-col-actions" aria-hidden="true"></span>
                      <span class="activity-todo-head-label">Account / person</span>
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
                              <a [routerLink]="['/accounts', row.clientId]" class="side-list-title">{{ row.clientName }}</a>
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
                          <span class="side-list-value side-list-value--strong activity-todo-col-owner">{{ row.owner }}</span>
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
                <a [routerLink]="['/accounts', o.id]">{{ orgDetail()?.name ?? o.name }}</a>
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
              <div class="bo-person-card side-person-card" role="link" tabindex="0" [attr.aria-label]="'Open ' + personLabel(p)" (click)="openPersonPage($event, p.id)" (keydown.enter)="openPersonPage($event, p.id)" [innerHTML]="personCard(p)"></div>
              @if (p.tags.length) {
                <app-tag-chip-list [tags]="p.tags" class="side-person-tags" />
              }
              <p class="side-person-last text-color-secondary">Last contact {{ p.lastContactAt ? rel(p.lastContactAt) : 'none logged' }}</p>
              @if (p.notes) {
                <div class="side-notes">{{ plain(p.notes) }}</div>
              }
              </div>
            </div>

            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Accounts</h3>
              </div>
              <div class="side-panel-scroll">
              @for (l of p.accountLinks; track l.clientId) {
                <div class="side-row">
                  <a [routerLink]="['/accounts', l.clientId]">{{ l.client.name }}</a>
                  @if (l.role) { <div class="text-color-secondary">{{ l.role }}</div> }
                </div>
                <app-next-step [clientId]="l.clientId" variant="panel" class="side-next-step" />
              } @empty {
                <p class="text-color-secondary mb-0">Not linked to an account.</p>
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
            @if (item.subject?.trim(); as subj) {
              <strong>{{ subj }}</strong><br />
            }
          </p>
          @let fp = sendersOf(item);
          <div class="activity-meta file-people">
            @if (fp.from) {
              <app-person [name]="fp.from.name" [email]="fp.from.email" [avatarUrl]="fp.from.avatarUrl" [personId]="fp.from.contactId ?? fp.from.userId ?? fp.from.email" size="sm" />
            }
            @if (fp.from && fp.to.length) { <i class="pi pi-arrow-right activity-arrow" aria-label="to"></i> }
            @for (p of fp.to; track p.email) {
              <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" size="sm" />
            }
          </div>
          <div class="file-form">
            <p-selectbutton
              [options]="kindOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="kind"
              [allowEmpty]="false"
              (onChange)="targetId = null"
            />
            @if (kind === 'lead' && pipelines().length > 1) {
              <p-select
                [options]="pipelines()"
                optionLabel="name"
                optionValue="id"
                [ngModel]="pipelineId()"
                (ngModelChange)="pipelineId.set($event); targetId = null; newLaneId = lanes()[0]?.id ?? null"
                placeholder="Choose a pipeline"
                ariaLabel="Pipeline"
                styleClass="w-full"
                appendTo="body"
              />
            }
            @if (kind === 'lead') {
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="newCard" [(ngModel)]="newCard" [binary]="true" (onChange)="targetId = null" />
                <label for="newCard">New pipeline card</label>
              </div>
            }
            @if (kind === 'lead' && newCard) {
              <div class="form-field">
                <label for="newCardLane">Lane</label>
                <p-select inputId="newCardLane" [options]="lanes()" optionLabel="name" optionValue="id" [(ngModel)]="newLaneId" placeholder="Choose a lane" styleClass="w-full" appendTo="body" />
              </div>
              <div class="form-field">
                <label for="newCardOrg">Account</label>
                <p-select
                  inputId="newCardOrg"
                  [options]="orgOptions()"
                  optionLabel="label"
                  optionValue="label"
                  [(ngModel)]="newOrg"
                  [editable]="true"
                  [filter]="false"
                  [showClear]="true"
                  placeholder="Choose an account or type a new name"
                  styleClass="w-full"
                  appendTo="body"
                />
              </div>
              <div class="form-field">
                <label for="newCardContact">Contact</label>
                <input pInputText id="newCardContact" [(ngModel)]="newContact" class="w-full" />
              </div>
              <div class="form-field">
                <label for="newCardEmail">Email</label>
                <input pInputText id="newCardEmail" [(ngModel)]="newEmail" class="w-full" />
              </div>
            } @else {
            <p-select
              [options]="kind === 'client' ? orgOptions() : leadOptions()"
              optionLabel="label"
              optionValue="id"
              [(ngModel)]="targetId"
              [filter]="true"
              filterBy="label"
              filterPlaceholder="Search…"
              [showClear]="true"
              [placeholder]="kind === 'client' ? 'Choose an account' : 'Choose a pipeline card'"
              [ariaLabel]="kind === 'client' ? 'Account' : 'Pipeline card'"
              styleClass="w-full"
              appendTo="body"
            />
            }
            @if (kind === 'client') {
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="learn" [(ngModel)]="learn" [binary]="true" />
                <label for="learn">Link the people on this email to the account</label>
              </div>
            }
            @if (fileError()) {
              <p-message severity="error" [text]="fileError()!" />
            }
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="fileVisible = false" />
          <p-button label="File" icon="pi pi-check" [loading]="saving()" [disabled]="!canSaveFile()" (onClick)="saveFile()" />
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
    .side-person-card { display: block; cursor: pointer; margin: -0.5rem -0.65rem 0.5rem; }
    .side-person-card:hover .bo-person-card__name { text-decoration: underline; }
    .side-person-tags { display: block; margin-bottom: 0.5rem; }
    .side-person-last { margin: 0; font-size: var(--fs-sm); }
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
    .activity-meta.file-people { margin: 0.25rem 0 1.25rem; }
    .clickable-row { cursor: pointer; }
    .skeleton-list { display: flex; flex-direction: column; gap: 0.75rem; }
  `,
})
export class ActivityPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly peopleLoader = inject(PeoplePickerLoader);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formsApi = inject(FormsApi);
  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SessionService);
  /** Forms submissions waiting for review (a To do card that opens Forms). */
  readonly canForms = computed(() => !!areaLevel(this.session.me(), 'forms'));
  readonly submissions = signal<PendingSubmissionDto[]>([]);

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
  /** A pipeline card picked in the Account filter because it has no account record yet. */
  readonly cardId = computed(() => (this.orgId() ? null : this.params().get('card') || null));
  readonly personId = computed(() => this.params().get('person') || null);
  readonly personPickId = computed(() => (this.personId() ? `contact:${this.personId()}` : null));
  readonly queue = computed<QueueKey>(() => {
    const q = this.params().get('queue');
    return q === 'nextStep' || q === 'quiet' || (q === 'forms' && this.canForms()) ? q : 'unfiled';
  });

  readonly info = QUEUE_INFO;
  readonly queueKeys = computed<QueueKey[]>(() => (this.canForms() ? ['unfiled', 'forms', 'nextStep', 'quiet'] : ['unfiled', 'nextStep', 'quiet']));
  readonly scopeOptions = [
    { label: 'Mine', value: true },
    { label: "Everyone's", value: false },
  ];

  orgs = signal<Org[]>([]);
  /** Tenant-wide CRM people (when no account filter). */
  allPeopleOptions = signal<PeopleDirectoryOption[]>([]);
  peopleLoading = signal(false);
  /** True while loading org contacts for the Activity header person filter. */
  orgContactsLoading = signal(false);
  leads = signal<(Option & { pipelineId: string | null; clientId: string | null })[]>([]);
  pipelines = signal<{ id: string; name: string; stages: { id: string; name: string }[] }[]>([]);
  /** Lanes of the chosen pipeline (or the only one), for a new card. */
  readonly lanes = computed(() => {
    const list = this.pipelines();
    const pid = this.pipelineId();
    return (list.find((p) => p.id === pid) ?? list[0])?.stages ?? [];
  });
  newCard = false;
  newOrg: string | null = '';
  newContact = '';
  newEmail = '';
  newLaneId: string | null = null;
  /** File dialog: which pipeline's cards to list (only asked when there is more than one). */
  pipelineId = signal<string | null>(null);
  readonly leadOptions = computed(() => {
    const pid = this.pipelineId();
    return this.pipelines().length > 1 && pid ? this.leads().filter((l) => l.pipelineId === pid) : this.leads();
  });
  readonly orgOptions = computed(() => this.orgs().map((o) => ({ id: o.id, label: o.name })));
  /** Account filter: every account, plus pipeline cards not linked to one (value "card:<id>"). */
  readonly orgFilterOptions = computed(() => {
    const out: { id: string; name: string }[] = this.orgs().map((o) => ({ id: o.id, name: o.name }));
    const seen = new Set(out.map((o) => o.name.trim().toLowerCase()));
    for (const l of this.leads()) {
      if (l.clientId) continue;
      const key = l.label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `card:${l.id}`, name: l.label });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly orgFilterValue = computed(() => this.orgId() ?? (this.cardId() ? `card:${this.cardId()}` : null));
  readonly org = computed(() => {
    const id = this.orgId();
    return id ? this.orgs().find((o) => o.id === id) ?? { id, name: 'Account' } : null;
  });
  orgPeople = signal<ContactSummary[]>([]);
  orgDetail = signal<OrgDetail | null>(null);
  /** Overdue / Due today in the Next action panel header (organization context). */
  orgNextActionTag = signal<{ label: string; severity: 'danger' | 'warn' } | null>(null);
  readonly hasContext = computed(() => !!this.orgId() || !!this.personId());
  person = signal<ContactSummary | null>(null);

  /** Person filter: all CRM people, or only people linked to the selected account. */
  readonly personFilterOptions = computed(() =>
    this.orgId() ? contactSummariesToPeopleOptions(this.orgPeople()) : this.allPeopleOptions(),
  );

  readonly personFilterLoading = computed(() => this.peopleLoading() || this.orgContactsLoading());

  mine = signal(true);
  queues = signal<ActivityQueues | null>(null);
  queuesLoading = signal(false);
  queuesError = signal<string | null>(null);
  readonly thresholds = computed(() => this.queues()?.thresholds ?? { needsReplyDays: 2, goneQuietDays: 30 });
  // Unfiled mail is on no card, so a card filter shows none.
  readonly unfiled = computed(() => (this.cardId() ? [] : this.queues()?.unfiled ?? []));
  readonly queueRows = computed<QueueRow[]>(() => {
    const q = this.queues();
    if (!q) return [];
    const key = this.queue();
    const card = this.cardId();
    if (card) return key === 'nextStep' ? q.nextStep.filter((r) => r.leadId === card) : [];
    return key === 'nextStep' ? q.nextStep : key === 'quiet' ? q.quiet : [];
  });
  readonly todoTotal = computed(() => {
    const c = this.queues()?.counts;
    return c ? c.nextStepDue + c.unfiled : 0;
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
    { label: 'Account', value: 'client' },
    { label: 'Pipeline card', value: 'lead' },
  ];

  readonly sendersOf = senderAndRecipients;
  readonly icon = interactionIcon;
  rel = relativeTime;

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
    // Save the page's view (tab, To do list, organization/person, Mine) whenever it changes.
    effect(() => {
      this.tab();
      this.queue();
      this.orgId();
      this.cardId();
      this.personId();
      this.mine();
      untracked(() => {
        if (this.prefsReady) this.persistActivityPagePrefs();
      });
    });
  }

  async ngOnInit() {
    await this.restoreActivityPagePrefs();
    void this.loadCardsAndPipelines();
    if (this.canForms()) this.formsApi.pending().then((r) => this.submissions.set(r), () => this.submissions.set([]));
    this.peopleLoading.set(true);
    const [orgs, people] = await Promise.all([
      // Every journey (the endpoint's default leaves out prospects, which have next steps too).
      this.api.get<Org[]>('/clients?journey=PROSPECT,CLIENT,NONE').catch(() => [] as Org[]),
      this.peopleLoader.loadCrmContacts().catch(() => [] as PeopleDirectoryOption[]),
    ]);
    this.orgs.set([...orgs].sort((a, b) => a.name.localeCompare(b.name)));
    this.allPeopleOptions.set(people);
    this.peopleLoading.set(false);
  }

  /** False until saved prefs are restored, so the defaults on first load never overwrite them. */
  private prefsReady = false;

  private async restoreActivityPagePrefs() {
    const snap = this.route.snapshot.queryParamMap;
    const prefs = readListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.activity);
    const mine = listViewFilterBool(prefs, 'mine');
    if (mine === false) this.mine.set(false);
    if (['tab', 'queue', 'organization', 'card', 'person'].some((k) => snap.has(k))) {
      this.prefsReady = true;
      this.persistActivityPagePrefs();
      return;
    }
    const params: Record<string, string | null> = {};
    const tab = listViewFilterString(prefs, 'tab');
    if (tab === 'todo') params['tab'] = 'todo';
    // Restore the last To do list (Unfiled is the default, so it needs no param; old 'reply' is ignored).
    const queue = listViewFilterString(prefs, 'queue');
    if (queue === 'forms' || queue === 'nextStep' || queue === 'quiet') params['queue'] = queue;
    const organization = listViewFilterString(prefs, 'organization');
    if (organization) params['organization'] = organization;
    const card = listViewFilterString(prefs, 'card');
    if (card && !organization) params['card'] = card;
    const person = listViewFilterString(prefs, 'person');
    if (person) params['person'] = person;
    if (Object.keys(params).length) {
      await this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.prefsReady = true;
  }

  private persistActivityPagePrefs() {
    const filters: Record<string, string | boolean> = {
      tab: this.tab(),
      queue: this.queue(),
      mine: this.mine(),
    };
    const organization = this.orgId();
    if (organization) filters['organization'] = organization;
    const card = this.cardId();
    if (card) filters['card'] = card;
    const person = this.personId();
    if (person) filters['person'] = person;
    patchListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.activity, { filters });
  }

  private navigate(params: Record<string, string | null>) {
    // Saved by the prefs effect once the URL (and so tab/queue/organization/person) has actually changed.
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setMine(value: boolean) {
    this.mine.set(value);
    saveListFilter(this.session, LIST_VIEW_KEYS.activity, 'mine', value);
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
    this.navigate({ tab: 'todo', queue: q === 'unfiled' ? null : q });
  }

  setOrg(id: string | null) {
    this.orgNextActionTag.set(null);
    if (id?.startsWith('card:')) this.navigate({ organization: null, card: id.slice(5), person: null });
    else this.navigate({ organization: id || null, card: null, person: null });
  }

  onOrgNextStepHeaderStatus(tag: { label: string; severity: 'danger' | 'warn' } | null) {
    this.orgNextActionTag.set(tag);
  }

  setPerson(pickId: string | null) {
    this.navigate({ person: contactIdFromDirectoryId(pickId), organization: null, card: null });
  }

  countOf(q: QueueKey): number {
    if (q === 'forms') return this.submissions().length;
    if (this.cardId()) {
      const n = this.queues()?.nextStep.filter((r) => r.leadId === this.cardId()).length ?? 0;
      return q === 'nextStep' ? n : 0;
    }
    const c = this.queues()?.counts;
    if (!c) return 0;
    return c[q];
  }

  /** The standard person card (same markup as person cards in notes), for the person Details panel. */
  personCard(p: ContactSummary): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(
      personCardInnerHtml({
        contactId: p.id,
        name: contactName(p),
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? null,
        role: p.title ?? null,
        email: p.emails[0]?.email ?? '',
        phone: p.phone ?? '',
        avatarUrl: p.avatarUrl ?? null,
      }),
    );
  }

  /** Card click opens the person; its own email and phone links still work. */
  openPersonPage(event: Event, id: string) {
    if ((event.target as HTMLElement | null)?.closest('a')) return;
    void this.router.navigate(['/people', id]);
  }

  personLabel(p: ContactSummary): string {
    return contactName(p);
  }

  whenHeader(): string {
    const q = this.queue();
    return q === 'nextStep' ? 'Due' : 'Last contact';
  }

  whenLabel(row: QueueRow): string {
    if (!row.at) return row.queue === 'NEXT_STEP' ? 'No date' : 'Never';
    const d = new Date(row.at);
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

  unfiledActions(item: Interaction): RowActionItem[] {
    return [
      { id: 'file', label: 'File message', icon: 'pi pi-folder', command: () => void this.openFile(item) },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmRemoveUnfiled(item),
      },
    ];
  }

  private confirmRemoveUnfiled(item: Interaction) {
    const label = item.subject?.trim() || 'this message';
    this.confirmDelete.confirm({
      message: `Delete "${label}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.comms.remove(item.id);
          void this.comms.refreshUnfiledCount();
          this.comms.notifyActivityChanged();
          this.toast.add({ severity: 'success', summary: 'Deleted', detail: 'Message removed.' });
        } catch (err) {
          this.toast.add({
            severity: 'error',
            summary: 'Could not delete',
            detail: err instanceof Error ? err.message : 'Delete failed',
          });
        }
      },
    });
  }

  rowActions(row: QueueRow): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (row.queue === 'NEXT_STEP') {
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

  /** Pipeline cards and pipelines: for the Account filter (unlinked cards) and the File dialog. */
  private cardsLoaded: Promise<void> = Promise.resolve();
  private loadCardsAndPipelines(): Promise<void> {
    this.cardsLoaded = Promise.all([
      this.api.get<{ id: string; organization: string; pipelineId: string | null; clientId: string | null }[]>('/leads').catch(() => []),
      this.pipelinesApi.list().catch(() => []),
    ]).then(([leads, pipelines]) => {
      this.leads.set(leads.map((l) => ({ id: l.id, label: l.organization, pipelineId: l.pipelineId ?? null, clientId: l.clientId ?? null })));
      this.pipelines.set(pipelines.map((p) => ({ id: p.id, name: p.name, stages: [...p.stages].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ id: l.id, name: l.name })) })));
    });
    return this.cardsLoaded;
  }

  async openFile(item: Interaction) {
    this.active.set(item);
    this.kind = 'client';
    this.targetId = null;
    this.learn = true;
    this.fileError.set(null);
    this.fileVisible = true;
    await this.cardsLoaded;
    this.pipelineId.set(this.pipelines()[0]?.id ?? null);
    // New card: prefill from the sender.
    const from = senderAndRecipients(item).from;
    const email = from?.email ?? '';
    this.newCard = false;
    this.newContact = from?.name?.trim() ?? '';
    this.newEmail = email;
    this.newOrg = '';
    this.newLaneId = this.lanes()[0]?.id ?? null;
  }

  canSaveFile(): boolean {
    if (this.kind === 'lead' && this.newCard) return !!(this.newOrg ?? '').trim() && !!this.newLaneId;
    return !!this.targetId;
  }

  async saveFile() {
    const item = this.active();
    if (!item || !this.canSaveFile()) return;
    this.saving.set(true);
    this.fileError.set(null);
    try {
      if (this.kind === 'lead' && this.newCard) {
        // Create the card in the chosen lane, then file the email to it.
        const senderContactId = senderAndRecipients(item).from?.contactId ?? undefined;
        const orgName = (this.newOrg ?? '').trim();
        // Picked an existing account: link the card to it.
        const existingOrg = this.orgOptions().find((o) => o.label.trim().toLowerCase() === orgName.toLowerCase());
        const created = await this.api.post<{ id: string; organization: string; pipelineId: string | null }>('/leads', {
          organization: existingOrg?.label ?? orgName,
          ...(existingOrg ? { clientId: existingOrg.id } : {}),
          primaryContact: this.newContact.trim() || undefined,
          email: this.newEmail.trim() || undefined,
          stageId: this.newLaneId,
          source: 'INBOUND',
          ...(senderContactId ? { primaryContactId: senderContactId } : {}),
        });
        this.leads.update((l) => [...l, { id: created.id, label: created.organization, pipelineId: created.pipelineId ?? null, clientId: existingOrg?.id ?? null }]);
        this.targetId = created.id;
      }
      const res = await this.comms.file(item.id, this.kind === 'client' ? { clientId: this.targetId!, learn: this.learn } : { leadId: this.targetId! });
      this.fileVisible = false;
      const parts = ['Filed.'];
      if (res.threadItemsFiled) parts.push(`${res.threadItemsFiled} more from the same thread filed too.`);
      if (res.contactsLinked) parts.push(`Linked ${res.contactsLinked} contact${res.contactsLinked === 1 ? '' : 's'} to the account.`);
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
