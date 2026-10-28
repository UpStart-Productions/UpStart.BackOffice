import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { QuillModule } from 'ngx-quill';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import type Quill from 'quill';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { Person, TmProjectListItem, TmSection } from '../../task-manager/core/tm.types';
import {
  ActivityFeedFilter,
  CommunicationsApi,
  contactName,
  ContactSummary,
  Interaction,
  InteractionParticipant,
  interactionIcon,
  InteractionType,
  LogInteractionPayload,
  TeamMember,
  participantLine,
  senderAndRecipients,
  relativeTime,
  TimelineTarget,
} from '../../core/communications.api';
import { MessageBodyComponent } from '../message-body/message-body.component';
import { PersonComponent } from '../person/person.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';
import { ToolbarSearchFieldComponent } from '../toolbar-search-field/toolbar-search-field.component';
import { DateInputComponent } from '../date-input/date-input.component';
import { parseDateKey } from '../../core/date.util';

/** One timeline row: an item, and for an email thread how many messages it holds. */
type TimelineRow = { item: Interaction; threadKey: string | null; threadCount: number; nested: boolean };

type TypeFilter = 'ALL' | InteractionType;

type InvolvedOption = {
  id: string;
  label: string;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
};

function byLastName(a: InvolvedOption, b: InvolvedOption): number {
  const last = (a.lastName || a.firstName || a.label).localeCompare(b.lastName || b.firstName || b.label, undefined, { sensitivity: 'base' });
  if (last !== 0) return last;
  return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
}

function escapePlain(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Notes from the activity, kept on the new task. */
function taskNotes(item: Interaction): string | undefined {
  const chunks: string[] = [];
  if (item.location?.trim()) chunks.push(`<p>Where: ${escapePlain(item.location.trim())}</p>`);
  const body = item.bodyText?.trim();
  if (body) chunks.push(/<\/?[a-z][^>]*>/i.test(body) ? body : `<p>${escapePlain(body)}</p>`);
  return chunks.length ? chunks.join('') : undefined;
}

function idsPrefixed(ids: string[], kind: 'user' | 'contact'): string[] | undefined {
  const prefix = `${kind}:`;
  const picked = ids.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
  return picked.length ? picked : undefined;
}

function activityHaystack(item: Interaction): string {
  const bits = [
    item.subject,
    item.location,
    item.snippet,
    item.bodyText,
    item.loggedBy?.name,
    item.loggedBy?.firstName,
    item.loggedBy?.lastName,
    ...item.participants.flatMap((p) => [p.name, p.email]),
    ...item.captures.map((c) => c.capturedByEmail),
  ];
  return bits
    .filter((bit) => !!bit)
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();
}

/** `datetime-local` wants local time without a zone, e.g. 2026-10-17T14:30. */
function nowForInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Communication timeline for one organization, pipeline card or person, or for every organization
 * (Activity page, global): captured emails plus calls, meetings and notes logged by hand.
 *
 * An organization's timeline shows what is filed to it plus, with "Include people's activity", its people's activity
 * that is not filed to any organization (labelled with whose it is). Email threads collapse to their newest message.
 */
@Component({
  selector: 'app-activity-timeline',
  standalone: true,
  imports: [PersonComponent, 
    DatePipe,
    FormsModule,
    RouterLink,
    CheckboxModule,
    TagModule,
    TextareaModule,
    DateInputComponent,
    AppDialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    MultiSelectModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    ToolbarSearchFieldComponent,
    QuillModule,
    MessageBodyComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <div class="card">
      @if (!hideHeader()) {
        <div class="activity-header">
          <h3 class="text-lg font-semibold mb-0">Activity</h3>
          @if (fullViewParams(); as qp) {
            <div class="activity-header-actions">
              <a routerLink="/activity" [queryParams]="qp" class="activity-full-link">
                <i class="pi pi-window-maximize" aria-hidden="true"></i> Open full view
              </a>
            </div>
          }
        </div>
      }

      @if (canLog()) {
        <div class="quick-log" role="group" aria-label="Log activity">
          <p-selectbutton
            [options]="typeOptions"
            optionLabel="label"
            optionValue="value"
            [(ngModel)]="quickType"
            [allowEmpty]="false"
            ariaLabel="Activity type"
          />
          <label for="quickLogText" class="sr-only">What happened</label>
          <textarea
            pTextarea
            id="quickLogText"
            rows="2"
            [(ngModel)]="quickText"
            [placeholder]="quickPlaceholder()"
            class="w-full quick-log-text"
          ></textarea>
          @if (canSetFollowUp()) {
            <div class="quick-log-follow">
              <p-checkbox inputId="quickFollow" [(ngModel)]="quickFollow" [binary]="true" />
              <label for="quickFollow">Set the next step</label>
            </div>
            @if (quickFollow) {
              <div class="quick-log-next">
                <div class="form-field quick-log-next-text">
                  <label for="quickNextText">Next step</label>
                  <input pInputText id="quickNextText" [(ngModel)]="quickNextText" class="w-full" placeholder="e.g. Send the revised proposal" />
                </div>
                <div class="form-field quick-log-next-date">
                  <label for="quickNextDate">When</label>
                  <app-date-input inputId="quickNextDate" [(ngModel)]="quickNextDate" />
                </div>
              </div>
            }
          }
          @if (quickError()) {
            <p-message severity="error" [text]="quickError()!" />
          }
          <div class="quick-log-actions">
            <p-button label="More details…" severity="secondary" [text]="true" size="small" (onClick)="openLog(true)" />
            <p-button label="Log it" icon="pi pi-check" size="small" [loading]="quickSaving()" (onClick)="quickLog()" />
          </div>
        </div>
      }

      @if (error()) {
        <p-message severity="error" [text]="error()!" class="mb-3" />
      }

      @if (!(loading() && items().length === 0)) {
        <div class="activity-filter">
          <p-select
            [options]="filterOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="filter()"
            (ngModelChange)="filter.set($event)"
            appendTo="body"
            styleClass="activity-type-select"
            ariaLabel="Activity type"
          >
            <ng-template #item let-option>
              <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
            </ng-template>
            <ng-template #selectedItem let-option>
              <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
            </ng-template>
          </p-select>
          <div class="activity-search">
            <app-toolbar-search-field
              class="w-full"
              [placeholder]="searchPlaceholder()"
              ariaLabel="Search activity"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
          </div>
          @if (clientId()) {
            <div class="activity-people-toggle">
              <p-checkbox inputId="includePeople" [ngModel]="includePeople()" (ngModelChange)="includePeople.set($event)" [binary]="true" />
              <label for="includePeople">Include people's activity</label>
            </div>
          }
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
          <i class="pi" [class.pi-search]="query().trim()" [class.pi-filter]="!query().trim()" aria-hidden="true"></i>
          <p>{{ emptyFilterMessage() }}</p>
        </div>
      }

      @for (row of rows(); track row.item.id) {
        @let item = row.item;
        <div class="activity-item" [class.activity-item--nested]="row.nested">
          <div class="activity-icon activity-icon--{{ item.type }}" [attr.aria-label]="item.type" role="img">
            <i class="pi {{ icon(item) }}" aria-hidden="true"></i>
          </div>
          <div class="activity-body">
            <div class="activity-head">
              <strong>{{ item.subject || '(no subject)' }}</strong>
              <span class="activity-when">
                @if (logger(item); as who) {
                  <app-person [name]="who.name" [firstName]="who.firstName" [lastName]="who.lastName" [avatarUrl]="who.avatarUrl" [personId]="who.id" [size]="20" />
                }
                <span class="activity-date" [title]="(item.occurredAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(item.occurredAt) }}</span>
                <app-row-actions-menu [items]="entryActions(item)" ariaLabel="Activity actions" />
              </span>
            </div>
            <div class="activity-meta">
              @if (item.location) {
                <span>{{ item.location }}</span>
              }
              @let ppl = people(item);
              @for (p of ppl.from; track p.userId ?? p.contactId ?? p.email) {
                <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" [size]="20" />
              }
              @if (ppl.from.length && ppl.to.length) { <i class="pi pi-arrow-right activity-arrow" aria-label="to"></i> }
              @for (p of ppl.to; track p.userId ?? p.contactId ?? p.email) {
                <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" [size]="20" />
              }
              @if (!logger(item) && item.captures.length) {
                <span>· captured by {{ item.captures[0].capturedByEmail }}</span>
              }
              @if (showOrgNames() && item.client; as org) {
                <span>· <a [routerLink]="['/organizations', org.id]">{{ org.name }}</a></span>
              }
            </div>
            @if (item.via?.length) {
              <p-tag [value]="viaLabel(item)" severity="info" styleClass="activity-via" />
            }

            <app-message-body [item]="item" />
            @if (row.threadCount > 1 && !row.nested) {
              <button type="button" class="activity-thread-toggle" (click)="toggleThread(row.threadKey!)" [attr.aria-expanded]="isExpanded(row.threadKey!)">
                <i class="pi" [class.pi-chevron-down]="!isExpanded(row.threadKey!)" [class.pi-chevron-up]="isExpanded(row.threadKey!)" aria-hidden="true"></i>
                {{ isExpanded(row.threadKey!) ? 'Hide earlier messages' : (row.threadCount - 1) + ' earlier message' + (row.threadCount === 2 ? '' : 's') + ' in this thread' }}
              </button>
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
              (onEditorCreated)="onLogBodyEditor($event)"
            />
          }
        </div>
        @if (involvedGroups().length || involvedLoading()) {
          <div class="form-field">
            <label for="logContacts">Who was involved</label>
            <p-multiselect
              inputId="logContacts"
              [options]="involvedGroups()"
              [group]="true"
              optionGroupLabel="label"
              optionGroupChildren="items"
              optionLabel="label"
              optionValue="id"
              [(ngModel)]="involvedIds"
              [filter]="true"
              filterBy="label,firstName,lastName"
              filterPlaceHolder="Search…"
              [showToggleAll]="false"
              placeholder="Search and select…"
              [loading]="involvedLoading()"
              appendTo="body"
              styleClass="w-full involved-select"
              panelStyleClass="involved-panel"
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

    <p-dialog
      header="Forward activity"
      [(visible)]="forwardVisible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!forwarding()"
      [style]="{ width: 'min(36rem, 96vw)' }"
    >
      <div class="log-form">
        <p>Email this activity to the people you pick. Teammates also get a notification.</p>
        <div class="form-field">
          <label for="forwardPeople">People</label>
          <p-multiselect
            inputId="forwardPeople"
            [options]="involvedGroups()"
            [group]="true"
            optionGroupLabel="label"
            optionGroupChildren="items"
            optionLabel="label"
            optionValue="id"
            [(ngModel)]="forwardIds"
            [filter]="true"
            filterBy="label,firstName,lastName"
            filterPlaceHolder="Search…"
            [showToggleAll]="false"
            placeholder="Search and select…"
            [loading]="involvedLoading()"
            appendTo="body"
            styleClass="w-full involved-select"
            panelStyleClass="involved-panel"
          >
            <ng-template #item let-option>
              <app-person [name]="option.label" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="22" />
            </ng-template>
            <ng-template #selecteditems let-options let-removeChip="removeChip">
              @for (option of options ?? []; track option.id) {
                <span class="involved-chip">
                  <app-person [name]="option.label" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="26" />
                  <button type="button" class="involved-chip-remove" [attr.aria-label]="'Remove ' + option.label" (click)="removeChip(option.id, $event)">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path fill="currentColor" fill-rule="evenodd" d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16ZM5.1 4.2 8 7.1l2.9-2.9 0.9 0.9L8.9 8l2.9 2.9-0.9 0.9L8 8.9l-2.9 2.9-0.9-0.9L7.1 8 4.2 5.1l0.9-0.9Z" />
                    </svg>
                  </button>
                </span>
              }
            </ng-template>
          </p-multiselect>
        </div>
        @if (forwardError()) {
          <p-message severity="error" [text]="forwardError()!" />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="forwarding()" (onClick)="forwardVisible = false" />
        <p-button label="Send" icon="pi pi-send" [loading]="forwarding()" (onClick)="sendForward()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      header="Create task"
      [(visible)]="taskVisible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!taskSaving()"
      [style]="{ width: 'min(36rem, 96vw)' }"
    >
      <div class="log-form">
        <p>The notes from this activity are included on the task.</p>
        <div class="form-field">
          <label for="taskProject">Project</label>
          <p-select
            inputId="taskProject"
            [options]="taskProjects()"
            optionLabel="name"
            optionValue="id"
            [ngModel]="taskProjectId"
            (ngModelChange)="onTaskProject($event)"
            [filter]="true"
            filterBy="name"
            filterPlaceholder="Search…"
            [showClear]="true"
            [loading]="taskLoading()"
            placeholder="Search and select…"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        @if (taskSections().length) {
          <div class="form-field">
            <label for="taskSection">Section</label>
            <p-select
              inputId="taskSection"
              [options]="taskSections()"
              optionLabel="name"
              optionValue="id"
              [(ngModel)]="taskSectionId"
              [filter]="true"
              filterBy="name"
              filterPlaceholder="Search…"
              appendTo="body"
              styleClass="w-full"
            />
          </div>
        }
        <div class="form-field">
          <label for="taskTitle">Title</label>
          <input pInputText id="taskTitle" [(ngModel)]="taskTitle" class="w-full" placeholder="Task title" />
        </div>
        <div class="form-field">
          <label for="taskAssignee">Assign to</label>
          <p-select
            inputId="taskAssignee"
            [options]="taskAssignees()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="taskAssigneeId"
            [filter]="true"
            filterBy="name,email,firstName,lastName"
            filterPlaceholder="Search…"
            [showClear]="true"
            [disabled]="!taskProjectId"
            placeholder="Search and select…"
            appendTo="body"
            styleClass="w-full"
          >
            <ng-template #item let-option>
              <app-person [name]="option.name" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="22" />
            </ng-template>
            <ng-template #selectedItem let-option>
              <app-person [name]="option.name" [firstName]="option.firstName" [lastName]="option.lastName" [avatarUrl]="option.avatarUrl" [personId]="option.id" [size]="22" />
            </ng-template>
          </p-select>
        </div>
        @if (taskError()) {
          <p-message severity="error" [text]="taskError()!" />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="taskSaving()" (onClick)="taskVisible = false" />
        <p-button label="Create task" icon="pi pi-check" [loading]="taskSaving()" (onClick)="saveTask()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .activity-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .activity-header-actions { display: flex; align-items: center; gap: 0.5rem; }
    .activity-full-link { display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; font-weight: 500; }
    .quick-log { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.75rem; margin-bottom: 1rem; border: 1px solid var(--surface-border, #e5e7eb); border-radius: 0.5rem; background: var(--surface-50, #f9fafb); }
    .quick-log-text { resize: vertical; }
    .quick-log-follow { display: flex; align-items: center; gap: 0.5rem; }
    .quick-log-next { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .quick-log-next-text { flex: 2 1 16rem; min-width: 0; }
    .quick-log-next-date { flex: 1 1 10rem; min-width: 0; }
    .quick-log-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .activity-people-toggle { display: flex; align-items: center; gap: 0.4rem; flex: 0 0 auto; white-space: nowrap; }
    .activity-item--nested { margin-left: 2.85rem; border-top-style: dashed; }
    .activity-thread-toggle { display: inline-flex; align-items: center; gap: 0.35rem; margin-top: 0.4rem; padding: 0.25rem 0; border: 0; background: transparent; color: #1d4ed8; cursor: pointer; font: inherit; }
    :host ::ng-deep .activity-via { margin: 0.15rem 0 0.35rem; }
    .activity-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .activity-search {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
    }
    .activity-search .toolbar-search-field-host {
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
    }
    .activity-type-option { display: inline-flex; align-items: center; gap: 0.5rem; }
    :host ::ng-deep .activity-type-select { width: 12.5rem; flex: 0 0 auto; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .activity-item { display: flex; gap: 0.85rem; padding: 0.9rem 0; border-top: 1px solid var(--surface-border, #e5e7eb); }
    .activity-item:first-of-type { border-top: 0; }
    .activity-icon { --c: var(--text-color-secondary, #6b7280); flex: 0 0 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
    .activity-icon--EMAIL { --c: #2563eb; }
    .activity-icon--CALL { --c: #16a34a; }
    .activity-icon--MEETING { --c: #7c3aed; }
    .activity-icon--NOTE { --c: #d97706; }
    .activity-body { flex: 1; min-width: 0; }
    .activity-head { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
    .activity-head strong { min-width: 0; }
    .activity-when {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex: 0 0 auto;
      font-size: var(--fs-base);
      line-height: 1.5rem;
    }
    .activity-date {
      white-space: nowrap;
      font-size: inherit;
      line-height: inherit;
      color: var(--text-color-secondary, #6b7280);
      cursor: default;
    }
    :host ::ng-deep .activity-when .row-actions-trigger {
      width: 1.75rem;
      height: 1.75rem;
      padding: 0 !important;
    }
    :host ::ng-deep .activity-when .person-name {
      display: inline-flex;
      align-items: center;
      font-size: inherit;
      line-height: inherit;
    }
    .activity-arrow { font-size: var(--fs-sm); color: var(--text-color-secondary); }
    .activity-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.25rem 0; font-size: var(--fs-sm); color: var(--text-color-secondary, #6b7280); }
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
    :host ::ng-deep .involved-panel .p-multiselect-option-group {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-color-secondary, #6b7280);
    }
  `,
})
export class ActivityTimelineComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly tasks = inject(TmApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);

  clientId = input<string | null>();
  leadId = input<string | null>();
  contactId = input<string | null>();
  /** Every organization (Activity page). Ignored when clientId, leadId or contactId is set. */
  global = input(false);
  /** Extra filters from the Activity page (type, who logged it, dates, search). */
  feedFilter = input<ActivityFeedFilter | null>(null);
  /** The Activity page shows its own heading. */
  hideHeader = input(false);
  /** Show an "Open full view" link to the Activity page (record pages). */
  showFullViewLink = input(true);
  /** Second group heading: the organization these people belong to. */
  organizationName = input<string>();

  readonly target = computed<TimelineTarget | { global: true } | null>(() => {
    const c = this.clientId();
    const l = this.leadId();
    const k = this.contactId();
    if (c) return { clientId: c };
    if (l) return { leadId: l };
    if (k) return { contactId: k };
    if (this.global()) return { global: true };
    return null;
  });
  readonly canLog = computed(() => !!this.clientId() || !!this.leadId() || !!this.contactId());
  /** The next step lives on organizations. */
  readonly canSetFollowUp = computed(() => !!this.clientId());
  /** Organization names on items whenever the feed spans organizations. */
  readonly showOrgNames = computed(() => !this.clientId() && !this.leadId());
  readonly includePeople = signal(true);
  readonly fullViewParams = computed<Record<string, string> | null>(() => {
    if (!this.showFullViewLink()) return null;
    const c = this.clientId();
    const k = this.contactId();
    const params: Record<string, string> = { tab: 'all' };
    if (c) params['organization'] = c;
    else if (k) params['person'] = k;
    else return null;
    return params;
  });
  private readonly expandedThreads = signal<ReadonlySet<string>>(new Set());

  items = signal<Interaction[]>([]);
  nextBefore = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  filter = signal<TypeFilter>('ALL');
  query = signal('');
  readonly skeletonRows = [1, 2, 3];
  readonly visible = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    const typed = f === 'ALL' ? this.items() : this.items().filter((i) => i.type === f);
    if (!q) return typed;
    return typed.filter((i) => activityHaystack(i).includes(q));
  });
  /** Email threads collapse to their newest message; earlier ones show nested when expanded. */
  readonly rows = computed<TimelineRow[]>(() => {
    const list = this.visible();
    const counts = new Map<string, number>();
    for (const i of list) {
      if (i.type === 'EMAIL' && i.threadKey) counts.set(i.threadKey, (counts.get(i.threadKey) ?? 0) + 1);
    }
    const expanded = this.expandedThreads();
    const seen = new Set<string>();
    const out: TimelineRow[] = [];
    for (const item of list) {
      const key = item.type === 'EMAIL' && item.threadKey ? item.threadKey : null;
      if (!key) {
        out.push({ item, threadKey: null, threadCount: 1, nested: false });
        continue;
      }
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ item, threadKey: key, threadCount: counts.get(key) ?? 1, nested: false });
        if (expanded.has(key)) {
          for (const older of list) {
            if (older !== item && older.type === 'EMAIL' && older.threadKey === key) {
              out.push({ item: older, threadKey: key, threadCount: 1, nested: true });
            }
          }
        }
      }
    }
    return out;
  });

  isExpanded(key: string): boolean {
    return this.expandedThreads().has(key);
  }

  toggleThread(key: string) {
    const next = new Set(this.expandedThreads());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedThreads.set(next);
  }

  viaLabel(item: Interaction): string {
    const names = item.via ?? [];
    return names.length === 1 ? `From ${names[0]}'s activity` : `From people's activity: ${names.join(', ')}`;
  }

  readonly filterName = computed(() => this.filterOptions.find((o) => o.value === this.filter())?.label.toLowerCase() ?? 'activity');
  readonly searchPlaceholder = computed(() => (this.filter() === 'ALL' ? 'Search activity…' : `Search ${this.filterName()}…`));

  emptyFilterMessage(): string {
    const older = this.nextBefore() ? ' Try loading older activity.' : '';
    const q = this.query().trim();
    if (!q) return `No ${this.filterName()} in the activity loaded so far.${older}`;
    if (this.filter() === 'ALL') return `No activity matches "${q}".${older}`;
    return `No ${this.filterName()} match "${q}".${older}`;
  }
  readonly emptyMessage = computed(() =>
    this.canLog()
      ? 'No activity yet. Log a call, meeting, or note above.'
      : 'No activity yet.',
  );

  // Quick log (inline bar)
  quickType: 'CALL' | 'MEETING' | 'NOTE' = 'NOTE';
  quickText = '';
  quickFollow = false;
  quickNextText = '';
  quickNextDate = '';
  quickSaving = signal(false);
  quickError = signal<string | null>(null);

  quickPlaceholder(): string {
    if (this.quickType === 'CALL') return 'How did the call go?';
    if (this.quickType === 'MEETING') return 'What was decided?';
    return 'What happened?';
  }

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
  involvedIds: string[] = [];
  involvedLoading = signal(false);

  forwardVisible = false;
  forwarding = signal(false);
  forwardError = signal<string | null>(null);
  forwardIds: string[] = [];
  private forwardItem: Interaction | null = null;

  taskVisible = false;
  taskSaving = signal(false);
  taskLoading = signal(false);
  taskError = signal<string | null>(null);
  taskProjects = signal<TmProjectListItem[]>([]);
  taskSections = signal<TmSection[]>([]);
  taskAssignees = signal<Person[]>([]);
  taskProjectId: string | null = null;
  taskSectionId: string | null = null;
  taskAssigneeId: string | null = null;
  taskTitle = '';
  private taskItem: Interaction | null = null;
  teamOptions = signal<InvolvedOption[]>([]);
  contactOptions = signal<InvolvedOption[]>([]);
  readonly involvedGroups = computed(() => {
    const groups: { label: string; items: InvolvedOption[] }[] = [];
    const team = this.teamOptions();
    if (team.length) groups.push({ label: 'Our team', items: team });
    const people = this.contactOptions();
    if (people.length) groups.push({ label: this.organizationName()?.trim() || 'Their people', items: people });
    return groups;
  });

  readonly filterOptions: { label: string; value: TypeFilter; icon: string }[] = [
    { label: 'All', value: 'ALL', icon: 'pi-list' },
    { label: 'Emails', value: 'EMAIL', icon: 'pi-envelope' },
    { label: 'Calls', value: 'CALL', icon: 'pi-phone' },
    { label: 'Meetings', value: 'MEETING', icon: 'pi-calendar' },
    { label: 'Notes', value: 'NOTE', icon: 'pi-file-edit' },
  ];
  readonly typeOptions = [
    { label: 'Note', value: 'NOTE' },
    { label: 'Call', value: 'CALL' },
    { label: 'Meeting', value: 'MEETING' },
  ];
  readonly callOptions = [
    { label: 'We called', value: 'OUTBOUND' },
    { label: 'They called', value: 'INBOUND' },
    { label: 'Internal', value: 'INTERNAL' },
  ];

  constructor() {
    effect(() => {
      // Reload whenever the subject, the filters or the people toggle change, or activity changes elsewhere.
      this.target();
      this.feedFilter();
      this.includePeople();
      this.comms.activityChanged();
      untracked(() => void this.load(false));
    });
  }

  subjectPlaceholder(): string {
    if (this.logType === 'MEETING') return 'e.g. Discovery meeting';
    if (this.logType === 'NOTE') return 'e.g. Follow-up';
    return 'e.g. Intake call';
  }

  onLogBodyEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const clientId = this.clientId()?.trim();
      if (clientId) return { type: 'client', clientId };
      return { type: 'crm' };
    });
  }

  icon = (i: Interaction) => interactionIcon(i.type);
  /**
   * Emails: sender, then recipients.
   * Calls: who placed the call, then who answered. The person who logged it is on the calling
   * side for We called and Internal, and on the answering side for They called.
   */
  people(item: Interaction): { from: InteractionParticipant[]; to: InteractionParticipant[] } {
    const row = senderAndRecipients(item);
    const loggerId = item.loggedBy?.id;
    const isLogger = (p: { userId: string | null }) => !!loggerId && p.userId === loggerId;
    if (item.type !== 'CALL') {
      return {
        from: row.from && !isLogger(row.from) ? [row.from] : [],
        to: row.to.filter((p) => !isLogger(p)),
      };
    }
    const others = item.participants.filter((p) => !isLogger(p));
    const ours = others.filter((p) => p.userId);
    const theirs = others.filter((p) => !p.userId);
    const caller = this.loggerParticipant(item);
    if (item.direction === 'INBOUND') return { from: theirs, to: [...(caller ? [caller] : []), ...ours] };
    if (item.direction === 'INTERNAL') return { from: caller ? [caller] : ours, to: caller ? ours : [] };
    return { from: [...(caller ? [caller] : []), ...ours], to: theirs };
  }
  /** The person who logged a call, shown with their name rather than the stored email. */
  private loggerParticipant(item: Interaction): InteractionParticipant | null {
    const who = item.loggedBy;
    if (!who) return null;
    const saved = item.participants.find((p) => p.userId === who.id);
    const name = [who.firstName, who.lastName].filter(Boolean).join(' ').trim() || who.name?.trim() || saved?.name || null;
    return {
      email: saved?.email ?? '',
      name,
      role: 'ATTENDEE',
      contactId: null,
      userId: who.id,
      avatarUrl: who.avatarUrl ?? saved?.avatarUrl ?? null,
    };
  }
  logger(item: Interaction): Interaction['loggedBy'] {
    const who = item.loggedBy;
    if (!who) return null;
    if (who.name?.trim() || who.firstName?.trim() || who.lastName?.trim()) return who;
    return null;
  }
  participants = (i: Interaction) => participantLine(i);
  rel = relativeTime;

  async load(more: boolean) {
    const target = this.target();
    if (!target) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const before = more ? this.nextBefore() : null;
      const page =
        'leadId' in target
          ? await this.comms.timeline(target, before)
          : await this.comms.activity(
              {
                ...(this.feedFilter() ?? {}),
                clientId: 'clientId' in target ? target.clientId : this.feedFilter()?.clientId,
                contactId: 'contactId' in target ? target.contactId : this.feedFilter()?.contactId,
                includePeople: this.includePeople(),
              },
              before,
            );
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.nextBefore.set(page.nextBefore);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      this.loading.set(false);
    }
  }

  entryActions(item: Interaction): RowActionItem[] {
    return [
      { id: 'forward', label: 'Forward', icon: 'pi pi-send', command: () => void this.openForward(item) },
      { id: 'task', label: 'Create task', icon: 'pi pi-check-square', command: () => void this.openTask(item) },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove(item) },
    ];
  }

  /** Full log dialog. From the quick bar, it starts with the type and text typed there. */
  async openLog(fromQuick = false) {
    this.logType = fromQuick ? this.quickType : 'CALL';
    this.logWhen = nowForInput();
    this.logDirection = 'OUTBOUND';
    this.logWhere = '';
    this.logSubject = '';
    this.logBody = fromQuick && this.quickText.trim() ? `<p>${escapePlain(this.quickText.trim())}</p>` : '';
    this.involvedIds = [];
    this.logError.set(null);
    this.logVisible = true;
    await this.loadPeople();
  }

  private async loadPeople(forClientId?: string | null) {
    this.involvedLoading.set(true);
    const clientId = forClientId === undefined ? this.clientId() ?? null : forClientId;
    try {
      const [team, contacts] = await Promise.all([
        this.comms.team().catch(() => [] as TeamMember[]),
        clientId ? this.comms.contacts({ clientId }).catch(() => [] as ContactSummary[]) : Promise.resolve([] as ContactSummary[]),
      ]);
      const teamEmails = new Set(team.map((u) => u.email.trim().toLowerCase()).filter(Boolean));
      this.teamOptions.set(
        team
          .map((u) => ({
            id: `user:${u.id}`,
            label: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email,
            firstName: u.firstName ?? '',
            lastName: u.lastName,
            avatarUrl: u.avatarUrl,
          }))
          .sort(byLastName),
      );
      this.contactOptions.set(
        contacts
          .filter((c) => {
            const email = (c.emails.find((e) => e.isPrimary) ?? c.emails[0])?.email?.trim().toLowerCase();
            return !email || !teamEmails.has(email);
          })
          .map((c) => ({
            id: `contact:${c.id}`,
            label: contactName(c),
            firstName: c.firstName,
            lastName: c.lastName,
            avatarUrl: c.avatarUrl ?? null,
          }))
          .sort(byLastName),
      );
    } finally {
      this.involvedLoading.set(false);
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
        ...this.logTarget(),
        occurredAt: this.logWhen ? new Date(this.logWhen).toISOString() : undefined,
        subject: this.logSubject.trim() || undefined,
        bodyText: notes,
        location: this.logType === 'MEETING' ? this.logWhere.trim() || undefined : undefined,
        direction: this.logType === 'CALL' ? this.logDirection : this.logType === 'NOTE' ? 'INTERNAL' : 'OUTBOUND',
        contactIds: idsPrefixed(this.involvedIds, 'contact'),
        userIds: idsPrefixed(this.involvedIds, 'user'),
      };
      await this.comms.log(payload);
      this.logVisible = false;
      this.quickText = '';
      this.toast.add({ severity: 'success', summary: 'Logged', detail: 'Activity added to the timeline.' });
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.logError.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** Where a logged activity goes: the organization, card or person this timeline is for. */
  private logTarget(): Pick<LogInteractionPayload, 'clientId' | 'leadId' | 'contactId'> {
    const c = this.clientId();
    const l = this.leadId();
    const k = this.contactId();
    if (c) return { clientId: c };
    if (l) return { leadId: l };
    return k ? { contactId: k } : {};
  }

  async quickLog() {
    const text = this.quickText.trim();
    if (!text) {
      this.quickError.set('Type what happened first.');
      return;
    }
    if (this.quickFollow && !this.quickNextText.trim()) {
      this.quickError.set('Add the next step, or untick Set the next step.');
      return;
    }
    this.quickSaving.set(true);
    this.quickError.set(null);
    try {
      await this.comms.log({
        type: this.quickType,
        ...this.logTarget(),
        bodyText: `<p>${escapePlain(text)}</p>`,
        direction: this.quickType === 'NOTE' ? 'INTERNAL' : 'OUTBOUND',
      });
      const clientId = this.clientId();
      if (this.quickFollow && clientId) {
        const day = this.quickNextDate ? parseDateKey(this.quickNextDate) : null;
        day?.setHours(12, 0, 0, 0);
        await this.comms.setNextStep(clientId, { text: this.quickNextText.trim(), date: day ? day.toISOString() : null });
      }
      this.quickText = '';
      this.quickFollow = false;
      this.quickNextText = '';
      this.quickNextDate = '';
      this.toast.add({ severity: 'success', summary: 'Logged', detail: 'Added to the timeline.' });
      this.comms.notifyActivityChanged();
    } catch (err) {
      this.quickError.set(err instanceof Error ? err.message : 'Could not log it');
    } finally {
      this.quickSaving.set(false);
    }
  }

  async openForward(item: Interaction) {
    this.forwardItem = item;
    this.forwardIds = [];
    this.forwardError.set(null);
    this.forwardVisible = true;
    await this.loadPeople(item.clientId ?? this.clientId());
  }

  async sendForward() {
    const item = this.forwardItem;
    if (!item) return;
    if (!this.forwardIds.length) {
      this.forwardError.set('Choose at least one person.');
      return;
    }
    this.forwarding.set(true);
    this.forwardError.set(null);
    try {
      const result = await this.comms.forward(item.id, {
        userIds: idsPrefixed(this.forwardIds, 'user'),
        contactIds: idsPrefixed(this.forwardIds, 'contact'),
      });
      if (!result.emailed) {
        this.forwardError.set(result.notified ? 'Could not send the email. Teammates were still notified.' : 'Could not send the email.');
        return;
      }
      this.forwardVisible = false;
      const notified = result.notified ? ` ${result.notified} ${result.notified === 1 ? 'teammate was' : 'teammates were'} notified.` : '';
      const missed = result.failed ? ` ${result.failed} could not be emailed.` : '';
      this.toast.add({
        severity: result.failed ? 'warn' : 'success',
        summary: 'Forwarded',
        detail: `Emailed ${result.emailed}.${notified}${missed}`,
      });
    } catch (err) {
      this.forwardError.set(err instanceof Error ? err.message : 'Could not forward this activity');
    } finally {
      this.forwarding.set(false);
    }
  }

  async openTask(item: Interaction) {
    this.taskItem = item;
    this.taskTitle = item.subject?.trim() || '';
    this.taskProjectId = null;
    this.taskSectionId = null;
    this.taskAssigneeId = null;
    this.taskSections.set([]);
    this.taskAssignees.set([]);
    this.taskError.set(null);
    this.taskVisible = true;
    this.taskLoading.set(true);
    try {
      const projects = await this.tasks.listProjects();
      this.taskProjects.set(projects.filter((p) => p.isActive));
      if (!this.taskProjects().length) this.taskError.set('No task projects yet.');
    } catch (err) {
      this.taskError.set(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      this.taskLoading.set(false);
    }
  }

  async onTaskProject(projectId: string | null) {
    this.taskProjectId = projectId;
    this.taskSectionId = null;
    this.taskAssigneeId = null;
    this.taskSections.set([]);
    this.taskAssignees.set([]);
    if (!projectId) return;
    this.taskLoading.set(true);
    this.taskError.set(null);
    try {
      const [project, people] = await Promise.all([this.tasks.getProject(projectId), this.tasks.people(projectId)]);
      const sections = [...project.sections].sort((a, b) => a.sortOrder - b.sortOrder);
      this.taskSections.set(sections);
      this.taskSectionId = sections[0]?.id ?? null;
      this.taskAssignees.set(
        [...people].sort((a, b) => (a.lastName || a.name || '').localeCompare(b.lastName || b.name || '', undefined, { sensitivity: 'base' })),
      );
    } catch (err) {
      this.taskError.set(err instanceof Error ? err.message : 'Could not load that project');
    } finally {
      this.taskLoading.set(false);
    }
  }

  async saveTask() {
    const item = this.taskItem;
    if (!item) return;
    if (!this.taskProjectId) {
      this.taskError.set('Choose a project.');
      return;
    }
    if (!this.taskTitle.trim()) {
      this.taskError.set('Add a title.');
      return;
    }
    this.taskSaving.set(true);
    this.taskError.set(null);
    try {
      await this.tasks.createTask({
        projectId: this.taskProjectId,
        sectionId: this.taskSectionId,
        name: this.taskTitle.trim(),
        assigneeId: this.taskAssigneeId,
        description: taskNotes(item),
      });
      this.taskVisible = false;
      this.toast.add({ severity: 'success', summary: 'Task created', detail: 'The activity notes are on the task.' });
    } catch (err) {
      this.taskError.set(err instanceof Error ? err.message : 'Could not create the task');
    } finally {
      this.taskSaving.set(false);
    }
  }

  confirmRemove(item: Interaction) {
    const label = item.subject?.trim() || 'this activity';
    this.confirmDelete.confirm({
      message: `Delete "${label}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.comms.remove(item.id);
          this.items.update((list) => list.filter((row) => row.id !== item.id));
          this.toast.add({ severity: 'success', summary: 'Deleted', detail: 'Activity removed.' });
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Delete failed' });
        }
      },
    });
  }
}
