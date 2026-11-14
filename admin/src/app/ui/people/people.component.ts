import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import {
  CommunicationsApi,
  ContactSummary,
  contactName,
} from '../../core/communications.api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { contactIdFromDirectoryId, PeoplePickerLoader } from '../../core/people-picker.loader';
import { TeamApi, TeamMember, TeamScope } from '../../core/team.api';
import { PeopleDirectoryEntry } from '../../pages/projects/people-directory.types';
import { PeopleDirectoryOption, toDirectoryOptions } from '../../pages/projects/people-directory.util';
import { Person } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { CreatePersonModalComponent } from '../create-person-modal/create-person-modal.component';
import { PeopleSelectComponent } from '../people-select/people-select.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { PersonDetailModalComponent } from '../person-detail-modal/person-detail-modal.component';
import { PeoplePanelMode, PeopleProjectContact } from './people.types';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';

/**
 * Rubber-stamp People panel: pick existing (search), Add person (new-only modal), list.
 * Use on accounts/clients (`organization`) and projects (`project`).
 */
@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
    ButtonModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    CopyEmailComponent,
    TmAvatarComponent,
    TooltipModule,
    PeopleSelectComponent,
    CreatePersonModalComponent,
    HelpTextComponent,
    PersonDetailModalComponent,
  ],
  template: `
    <div
      class="people-panel"
      [class.card]="!embeddedInDialog()"
      [class.card--side]="compact() && !embeddedInDialog()"
      [class.people-panel--compact]="compact()"
      [class.people-panel--embedded]="embeddedInDialog()"
    >
      @if (showPanelTitle() || (!controlsAfterList() && mode() === 'project')) {
        <div class="card-header">
          @if (showPanelTitle()) {
            <h3 class="card-title">{{ panelTitle() ?? 'People' }} @if (hintKey()) { <app-help-text [key]="hintKey()!" /> }</h3>
          }
          @if (!controlsAfterList() && !readOnly()) {
            <p-button
              type="button"
              label="Add new person"
              icon="pi pi-plus"
              size="small"
              severity="secondary"
              (onClick)="openNewPerson()"
            />
          }
        </div>
      }

      @if (panelError() || (!controlsAfterList() && !readOnly())) {
        <div class="side-panel-controls">
          @if (panelError()) {
            <p-message severity="error" [text]="panelError()!" class="mb-3" />
          }
          @if (!controlsAfterList() && !readOnly()) {
            <div class="form-field people-panel-picker">
              <label [attr.for]="pickerInputId">Add existing person</label>
              <app-people-select
                [inputId]="pickerInputId"
                [(pickId)]="pickId"
                (picked)="onExistingDirectoryPicked($event)"
                [options]="pickerOptions()"
                [loading]="pickerLoading()"
                placeholder="Search and select…"
                ariaLabel="Add existing person"
              />
            </div>
          }
        </div>
      }

      <div class="side-panel-scroll">
      @if (mode() === 'organization' || mode() === 'lead') {
        @if (orgLoading() && orgPeople().length === 0) {
          <div aria-busy="true" aria-label="Loading people">
            @for (n of skeletonRows; track n) {
              <div class="people-panel-org-row"><p-skeleton width="40%" height="1rem" /></div>
            }
          </div>
        } @else if (orgPeople().length === 0 && (mode() === 'lead' || teamRows().length === 0)) {
          <div class="empty-state">
            <i class="pi pi-users" aria-hidden="true"></i>
            <p>No people linked yet.</p>
          </div>
        }
        @for (c of orgPeople(); track c.id) {
          <div class="people-panel-org-row">
            <app-tm-avatar [person]="orgRowPerson(c)" size="lg" [showTitle]="false" />
            <div class="people-panel-org-main">
              <div class="people-panel-org-name-line">
                <button type="button" class="people-panel-name-link" (click)="openPersonDetail(c.id)">
                  {{ contactName(c) }}
                </button>
                @if (primaryContactPickerEnabled() && primaryContactId() === c.id) {
                  <p-tag value="Primary contact" severity="info" />
                }
                @if (c.autoCreated) {
                  <p-tag value="New" severity="info" />
                }
                @if (!c.isActive) {
                  <p-tag value="Inactive" severity="secondary" />
                }
                @if ((clientId() || leadId()) && !readOnly()) {
                  <div class="people-panel-row-actions">
                    @if (primaryContactPickerEnabled() && primaryContactId() !== c.id) {
                      <p-button
                        type="button"
                        icon="pi pi-star"
                        [text]="true"
                        severity="secondary"
                        size="small"
                        styleClass="icon-action-btn"
                        aria-label="Set as primary contact"
                        pTooltip="Set as primary contact"
                        tooltipPosition="left"
                        [showDelay]="actionTooltipDelayMs"
                        tooltipStyleClass="ubo-dark-tooltip"
                        appendTo="body"
                        (onClick)="setPrimaryContact.emit(c.id)"
                      />
                    }
                    <p-button
                      type="button"
                      icon="pi pi-user-minus"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      styleClass="icon-action-btn"
                      [attr.aria-label]="'Remove ' + contactName(c)"
                      pTooltip="Remove from list"
                      tooltipPosition="left"
                      [showDelay]="actionTooltipDelayMs"
                      tooltipStyleClass="ubo-dark-tooltip"
                      appendTo="body"
                      (onClick)="leadContactSlot() ? clearLeadSlot() : unlinkFromOrg(c)"
                    />
                  </div>
                }
              </div>
              @if (orgRole(c); as role) {
                <span class="people-panel-meta">{{ role }}</span>
              } @else if (c.title) {
                <span class="people-panel-meta">{{ c.title }}</span>
              }
              <app-copy-email [email]="c.emails[0]?.email" [muted]="true" [block]="true" />
            </div>
          </div>
        }
        @for (m of teamRows(); track m.id) {
          <div class="people-panel-org-row">
            <app-tm-avatar [person]="m" size="lg" [showTitle]="false" />
            <div class="people-panel-org-main">
              <div class="people-panel-org-name-line">
                <span class="people-panel-name-static">{{ m.name }}</span>
                <p-tag [value]="m.isGuest ? 'Guest' : 'Team'" severity="secondary" />
                @if (m.direct && !readOnly()) {
                  <div class="people-panel-row-actions">
                    <p-button
                      type="button"
                      icon="pi pi-user-minus"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      styleClass="icon-action-btn"
                      [attr.aria-label]="'Remove ' + m.name"
                      pTooltip="Remove from account"
                      tooltipPosition="left"
                      [showDelay]="actionTooltipDelayMs"
                      tooltipStyleClass="ubo-dark-tooltip"
                      appendTo="body"
                      (onClick)="removeTeamMember(m)"
                    />
                  </div>
                }
              </div>
              @if (teamProjectsLine(m); as line) {
                <span class="people-panel-meta">{{ line }}</span>
              }
              <app-copy-email [email]="m.email" [muted]="true" [block]="true" />
            </div>
          </div>
        }
      } @else {
        @for (contact of projectPeople(); track $index; let rowIndex = $index) {
          <div class="people-panel-project-row">
            <app-tm-avatar [person]="projectRowPerson(contact)" size="lg" [showTitle]="false" />
            <div class="people-panel-project-main">
              <div class="people-panel-org-name-line">
                @if (contact.contactId) {
                  <button type="button" class="people-panel-name-link" (click)="openPersonDetail(contact.contactId)">
                    {{ projectDisplayName(contact) || 'Unnamed' }}
                  </button>
                } @else {
                  <span class="people-panel-name-static">{{ projectDisplayName(contact) || 'Unnamed' }}</span>
                }
                @if (!readOnly()) {
                  <div class="people-panel-row-actions">
                    <p-button
                      type="button"
                      icon="pi pi-user-minus"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      styleClass="icon-action-btn"
                      [attr.aria-label]="'Remove ' + (projectDisplayName(contact) || 'person')"
                      pTooltip="Remove from project"
                      tooltipPosition="left"
                      [showDelay]="actionTooltipDelayMs"
                      tooltipStyleClass="ubo-dark-tooltip"
                      appendTo="body"
                      (onClick)="removeProjectContact(rowIndex)"
                    />
                  </div>
                }
              </div>
              @if (!contact.contactId) {
                <span class="people-panel-meta">Legacy contact — remove and add from People</span>
              }
              <div class="people-panel-project-details">
                @if (contact.phone) {
                  <span class="people-panel-meta">{{ contact.phone }}</span>
                }
                @if (contact.email) {
                  <app-copy-email [email]="contact.email" [muted]="true" />
                }
              </div>
            </div>
          </div>
        }
        @for (m of teamRows(); track m.id) {
          <div class="people-panel-project-row">
            <app-tm-avatar [person]="m" size="lg" [showTitle]="false" />
            <div class="people-panel-project-main">
              <div class="people-panel-org-name-line">
                <span class="people-panel-name-static">{{ m.name }}</span>
                <p-tag [value]="m.isGuest ? 'Guest' : 'Team'" severity="secondary" />
                @if (m.isLead) {
                  <p-tag value="Lead" severity="info" />
                }
                @if (!readOnly() && managesProjectPeople()) {
                  <div class="people-panel-row-actions">
                    @if (mode() === 'project') {
                      @if (m.isLead) {
                        <p-button
                          type="button"
                          icon="pi pi-user"
                          [text]="true"
                          severity="secondary"
                          size="small"
                          styleClass="icon-action-btn"
                          aria-label="Make member"
                          pTooltip="Make member"
                          tooltipPosition="left"
                          [showDelay]="actionTooltipDelayMs"
                          tooltipStyleClass="ubo-dark-tooltip"
                          appendTo="body"
                          (onClick)="setLead(m, false)"
                        />
                      } @else {
                        <p-button
                          type="button"
                          icon="pi pi-star"
                          [text]="true"
                          severity="secondary"
                          size="small"
                          styleClass="icon-action-btn"
                          aria-label="Make lead"
                          pTooltip="Make lead"
                          tooltipPosition="left"
                          [showDelay]="actionTooltipDelayMs"
                          tooltipStyleClass="ubo-dark-tooltip"
                          appendTo="body"
                          (onClick)="setLead(m, true)"
                        />
                      }
                    }
                    <p-button
                      type="button"
                      icon="pi pi-user-minus"
                      [text]="true"
                      severity="secondary"
                      size="small"
                      styleClass="icon-action-btn"
                      [attr.aria-label]="'Remove ' + m.name"
                      pTooltip="Remove from project"
                      tooltipPosition="left"
                      [showDelay]="actionTooltipDelayMs"
                      tooltipStyleClass="ubo-dark-tooltip"
                      appendTo="body"
                      (onClick)="removeTeamMember(m)"
                    />
                  </div>
                }
              </div>
              <div class="people-panel-project-details">
                <app-copy-email [email]="m.email" [muted]="true" />
              </div>
            </div>
          </div>
        }
        @if (projectPeople().length === 0 && teamRows().length === 0) {
          <p class="text-color-secondary mt-0 mb-0">No people on this project yet.</p>
        }
      }
      </div>

      @if (controlsAfterList() && !readOnly()) {
        <div class="side-panel-controls people-panel-add-block">
          <div class="form-field people-panel-picker">
            <label [attr.for]="pickerInputId">Add existing person</label>
            <app-people-select
              [inputId]="pickerInputId"
              [(pickId)]="pickId"
              (picked)="onExistingDirectoryPicked($event)"
              [options]="pickerOptions()"
              [loading]="pickerLoading()"
              placeholder="Search and select…"
              ariaLabel="Add existing person"
            />
          </div>
          <p-button
            type="button"
            label="Add new person"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            (onClick)="openNewPerson()"
          />
        </div>
      }

      <ng-content select="[peoplePanelExtra]" />

      @if (addPersonFlow() === 'modal') {
        <app-create-person-modal />
      }

      <app-person-detail-modal />
    </div>
  `,
  styles: `
    .people-panel-picker {
      margin-bottom: 1rem;
    }
    .people-panel-name-link {
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      font-weight: 600;
      line-height: 1.25;
      color: var(--primary-color);
      cursor: pointer;
      text-align: left;
    }
    .people-panel-name-link:hover {
      text-decoration: underline;
    }
    .people-panel-name-static {
      font-weight: 600;
      line-height: 1.25;
    }
    .people-panel-row-actions {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.05rem;
      flex-shrink: 0;
      margin-left: auto;
    }
    .people-panel-org-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.6rem 0;
      border-top: 1px solid var(--surface-border, #e5e7eb);
    }
    .people-panel-org-row:first-of-type {
      border-top: 0;
    }
    .people-panel-org-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .people-panel-org-name-line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      min-width: 0;
      width: 100%;
    }
    .people-panel-meta {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
    }
    .people-panel-project-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--surface-border);
    }
    .people-panel-project-row:first-of-type {
      border-top: 0;
    }
    .people-panel-project-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .people-panel-project-details {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .people-panel-add-block {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0;
      padding-top: 1rem;
      border-top: 1px solid var(--surface-border);
    }
    .people-panel-add-block .people-panel-picker {
      margin-bottom: 0;
    }
    .people-panel--embedded {
      padding: 0;
      margin: 0;
      background: transparent;
      box-shadow: none;
    }
  `,
})
export class PeopleComponent {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly peoplePicker = inject(PeoplePickerLoader);
  private readonly toast = inject(MessageService);
  private readonly team = inject(TeamApi);
  private readonly session = inject(SessionService);
  private readonly createPersonModal = viewChild(CreatePersonModalComponent);
  private readonly personDetailModal = viewChild(PersonDetailModalComponent);

  readonly contactName = contactName;
  protected readonly actionTooltipDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;

  /** `organization` = linked People on a client/org; `project` = project contact list (draft). */
  mode = input.required<PeoplePanelMode>();
  /** Account id (required for account mode). Also used when creating/linking from project. */
  clientId = input<string | null>(null);
  /** Pipeline card id (required for lead mode). */
  leadId = input<string | null>(null);
  /** Side-panel layout (narrow column). */
  compact = input(false);
  /** Optional registry key for panel help (? icon on the title). */
  hintKey = input<string | null>(null);
  /** When picking on a project, omit people already on this project. */
  projectId = input<string | null>(null);
  /** Hide the “People” heading (e.g. inside Project contacts dialog). */
  showPanelTitle = input(true);
  /** View only: no Add new person, Add existing person, or remove (e.g. the Activity page side panel). */
  readOnly = input(false);
  /** Project mode: list contacts first, then add-existing + Add person (Tasks dialog). */
  controlsAfterList = input(false);
  /** Inside a dialog: skip outer `.card` padding (modal already provides chrome). */
  embeddedInDialog = input(false);
  /** `modal` opens the new-person dialog; `delegate` emits addPersonRequested for the host to show inline UI. */
  addPersonFlow = input<'modal' | 'delegate'>('modal');
  addPersonRequested = output<void>();
  /** Show staff (Team) next to contacts and offer them in Add existing person. Off where the board's Share list already covers them. */
  showTeam = input(true);
  /** Pipeline lead: highlight and allow changing the card's primary contact person. */
  primaryContactPickerEnabled = input(false);
  primaryContactId = input<string | null>(null);
  warmConnectionContactId = input<string | null>(null);
  /** When set on a lead panel, this panel manages only that one role (Primary Contact / Warm Connect). */
  leadContactSlot = input<'primary' | 'warm' | null>(null);
  /** Replaces the default "People" heading (pipeline card side panels). */
  panelTitle = input<string | null>(null);
  setPrimaryContact = output<string>();
  /** Emitted when a slot panel updates the lead (primary or warm connection). */
  leadUpdated = output<Record<string, unknown>>();

  /** Project mode only — current contact rows. */
  projectContacts = input<PeopleProjectContact[]>([]);
  projectContactsChange = output<PeopleProjectContact[]>();
  /** Fired after project contact list changes (e.g. open contact accordion). */
  projectContactsDirty = output<void>();

  readonly pickerInputId = `people-panel-${Math.random().toString(36).slice(2, 9)}`;
  pickId: string | null = null;
  pickerOptions = signal<PeopleDirectoryOption[]>([]);
  pickerLoading = signal(false);
  panelError = signal<string | null>(null);

  orgPeople = signal<ContactSummary[]>([]);
  /** Project contact rows shown in the list (like orgPeople — loaded or saved via API when the project exists). */
  projectPeople = signal<PeopleProjectContact[]>([]);
  /** Staff on this client/project (see TeamApi). Saved right away, unlike the project contact draft. */
  teamRows = signal<TeamMember[]>([]);
  private teamCandidates: Person[] | null = null;
  orgLoading = signal(false);
  readonly skeletonRows = [1, 2];

  constructor() {
    effect(() => {
      if (this.mode() !== 'organization') return;
      const id = this.clientId();
      if (!id) return;
      void this.loadOrganizationPeople(id);
    });
    effect(() => {
      if (this.mode() !== 'lead') return;
      const id = this.leadId();
      if (!id) return;
      if (this.leadContactSlot()) {
        this.primaryContactId();
        this.warmConnectionContactId();
        void this.loadLeadSlotPerson();
      } else {
        void this.loadLeadPeople(id);
      }
    });
    effect(() => {
      const scope = this.teamScope();
      if (!scope) {
        this.teamRows.set([]);
        return;
      }
      void this.loadTeam(scope);
    });
    effect(() => {
      if (this.mode() !== 'project') return;
      const id = this.projectId();
      if (!id) return;
      void this.loadProjectPeople(id);
    });
    effect(() => {
      this.mode();
      this.clientId();
      this.projectId();
      this.projectPeople();
      this.orgPeople();
      this.teamRows();
      // Read-only panels have no picker, so skip loading its options.
      if (this.readOnly()) return;
      void this.reloadPickerOptions();
    });
  }

  orgRole(c: ContactSummary): string | null {
    const id = this.clientId();
    if (!id) return null;
    return c.accountLinks.find((l) => l.clientId === id)?.role ?? null;
  }

  openPersonDetail(contactId: string) {
    void this.personDetailModal()?.open(contactId);
  }

  orgRowPerson(c: ContactSummary): Person {
    const name = contactName(c);
    return {
      id: c.id,
      name,
      email: c.emails[0]?.email || name,
      firstName: c.firstName || null,
      lastName: c.lastName ?? null,
      avatarUrl: c.avatarUrl ?? null,
      role: 'USER',
      isGuest: false,
    };
  }

  async openNewPerson() {
    if (this.addPersonFlow() === 'delegate') {
      this.addPersonRequested.emit();
      return;
    }
    const clientId = this.clientId();
    const scope = this.teamScope();
    const offerLead = this.mode() === 'project' && scope?.kind === 'projects' && this.managesProjectPeople();
    const created = await this.createPersonModal()!.open({ clientId: clientId ?? undefined, offerLead });
    if (!created) return;
    if (this.mode() === 'organization' && clientId) {
      await this.loadOrganizationPeople(clientId);
    } else if (this.mode() === 'lead') {
      const leadId = this.leadId();
      if (leadId) {
        await this.api.post(`/leads/${leadId}/people`, { contactId: created.id });
        if (this.leadContactSlot()) {
          await this.assignLeadSlot(created.id);
        } else {
          await this.loadLeadPeople(leadId);
        }
      }
    } else if (this.mode() === 'project') {
      await this.addProjectContactFromSummary(created);
      if (created.makeLead && scope?.kind === 'projects' && created.leadEmail) {
        try {
          const res = await this.team.inviteLead(scope.id, created.leadEmail);
          this.teamRows.set(res.team);
          this.toast.add({
            severity: 'success',
            summary: 'Lead added',
            detail: res.invited ? `${created.leadEmail} was invited as a Guest and is the Lead on this project.` : `${created.leadEmail} is now a Lead on this project.`,
          });
        } catch (err) {
          this.panelError.set(err instanceof Error ? err.message : 'Could not make them the Lead');
        }
      }
    }
    void this.reloadPickerOptions();
  }

  async onExistingDirectoryPicked(option: PeopleDirectoryOption) {
    this.panelError.set(null);
    try {
      if (option.id.startsWith('user:')) {
        await this.addTeamMember(option);
      } else if (this.mode() === 'organization') {
        await this.linkExistingToOrganization(option);
      } else if (this.mode() === 'lead') {
        await this.linkExistingToLead(option);
      } else {
        await this.linkExistingToProject(option);
      }
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not add person');
    } finally {
      setTimeout(() => {
        this.pickId = null;
      });
    }
  }

  private async linkExistingToOrganization(option: PeopleDirectoryOption) {
    const clientId = this.clientId();
    if (!clientId) return;
    const contactId = contactIdFromDirectoryId(option.id);
    if (!contactId) {
      this.toast.add({
        severity: 'warn',
        summary: 'People only',
        detail: 'Choose someone from People.',
      });
      return;
    }
    let contact = await this.comms.contact(contactId);
    if (!contact.accountLinks.some((l) => l.clientId === clientId)) {
      contact = await this.comms.linkAccount(contactId, clientId);
    }
    await this.loadOrganizationPeople(clientId);
    this.toast.add({ severity: 'success', summary: 'Person added', detail: option.displayName });
    void this.reloadPickerOptions();
  }

  private async linkExistingToProject(option: PeopleDirectoryOption) {
    const projectId = this.projectId();
    if (!projectId) return;
    const contactId = contactIdFromDirectoryId(option.id);
    if (!contactId) {
      this.toast.add({
        severity: 'warn',
        summary: 'People only',
        detail: 'Choose someone from People.',
      });
      return;
    }
    const rows = this.projectPeople();
    if (rows.some((c) => c.contactId === contactId)) {
      this.toast.add({
        severity: 'info',
        summary: 'Already on this project',
        detail: `${option.displayName} is already listed.`,
      });
      return;
    }
    const email = option.email.trim().toLowerCase();
    if (email && rows.some((c) => c.email.trim().toLowerCase() === email)) {
      this.toast.add({
        severity: 'info',
        summary: 'Already on this project',
        detail: `${option.displayName} is already listed.`,
      });
      return;
    }
    const next: PeopleProjectContact[] = [
      ...rows,
      {
        contactId,
        firstName: option.firstName,
        lastName: option.lastName,
        phone: option.phone,
        email: option.email,
        avatarUrl: option.avatarUrl,
        sortOrder: rows.length,
      },
    ];
    await this.persistProjectPeople(projectId, next);
    this.toast.add({ severity: 'success', summary: 'Person added', detail: option.displayName });
    void this.reloadPickerOptions();
  }

  private async addProjectContactFromSummary(c: ContactSummary) {
    const primaryEmail = c.emails.find((e) => e.isPrimary)?.email ?? c.emails[0]?.email ?? '';
    await this.addProjectContactRow({
      contactId: c.id,
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: primaryEmail,
      avatarUrl: c.avatarUrl ?? null,
      displayName: contactName(c) || primaryEmail || 'Person',
    });
  }

  private async addProjectContactRow(fields: {
    contactId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    avatarUrl: string | null;
    displayName: string;
  }) {
    const projectId = this.projectId();
    if (!projectId) return;
    const rows = this.projectPeople();
    if (rows.some((c) => c.contactId === fields.contactId)) {
      this.toast.add({
        severity: 'info',
        summary: 'Already on this project',
        detail: `${fields.displayName} is already listed.`,
      });
      return;
    }
    const email = fields.email.trim().toLowerCase();
    if (email && rows.some((c) => c.email.trim().toLowerCase() === email)) {
      this.toast.add({
        severity: 'info',
        summary: 'Already on this project',
        detail: `${fields.displayName} is already listed.`,
      });
      return;
    }
    const next: PeopleProjectContact[] = [
      ...rows,
      {
        contactId: fields.contactId,
        firstName: fields.firstName,
        lastName: fields.lastName,
        phone: fields.phone,
        email: fields.email,
        avatarUrl: fields.avatarUrl,
        sortOrder: rows.length,
      },
    ];
    await this.persistProjectPeople(projectId, next);
    this.toast.add({ severity: 'success', summary: 'Person added', detail: fields.displayName });
    void this.reloadPickerOptions();
  }

  private projectContactsPayload(rows: PeopleProjectContact[]) {
    const trim = (value: string) => value.trim() || undefined;
    return rows
      .map((contact, index) => ({
        id: contact.id,
        contactId: contact.contactId ?? undefined,
        firstName: trim(contact.firstName),
        lastName: trim(contact.lastName),
        phone: trim(contact.phone),
        email: trim(contact.email),
        sortOrder: index,
      }))
      .filter(
        (contact) =>
          contact.contactId ||
          contact.firstName ||
          contact.lastName ||
          contact.phone ||
          contact.email,
      );
  }

  private mapProjectContactsFromApi(contacts: PeopleProjectContact[]): PeopleProjectContact[] {
    return contacts.map((contact, index) => ({
      id: contact.id,
      contactId: contact.contactId ?? null,
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      avatarUrl: contact.avatarUrl ?? null,
      sortOrder: contact.sortOrder ?? index,
    }));
  }

  private async loadProjectPeople(projectId: string) {
    try {
      const project = await this.api.get<{ contacts?: PeopleProjectContact[] }>(`/projects/${projectId}`);
      const rows = this.mapProjectContactsFromApi(project.contacts ?? []);
      this.projectPeople.set(rows);
      this.projectContactsChange.emit(rows);
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Failed to load people');
      this.projectPeople.set([]);
    }
  }

  /** Save contacts then reload the list (same idea as link + loadOrganizationPeople on orgs). */
  private async persistProjectPeople(projectId: string, next: PeopleProjectContact[]) {
    await this.api.put(`/projects/${projectId}/contacts`, { contacts: this.projectContactsPayload(next) });
    await this.loadProjectPeople(projectId);
    this.projectContactsDirty.emit();
  }

  projectDisplayName(contact: Pick<PeopleProjectContact, 'firstName' | 'lastName'>): string {
    return [contact.firstName, contact.lastName]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' ');
  }

  projectRowPerson(contact: PeopleProjectContact): Person {
    const name = this.projectDisplayName(contact) || contact.email || 'Contact';
    return {
      id: contact.contactId ?? contact.id ?? contact.email ?? name,
      name,
      email: contact.email || name,
      firstName: contact.firstName || null,
      lastName: contact.lastName || null,
      avatarUrl: contact.avatarUrl ?? null,
      role: 'USER',
      isGuest: false,
    };
  }

  async unlinkFromOrg(c: ContactSummary) {
    const clientId = this.clientId();
    const leadId = this.leadId();
    if (!clientId && !leadId) return;
    try {
      if (this.mode() === 'lead' && leadId) {
        await this.api.delete(`/leads/${leadId}/people/${c.id}`);
        await this.loadLeadPeople(leadId);
      } else if (clientId) {
        await this.comms.unlinkAccount(c.id, clientId);
        await this.loadOrganizationPeople(clientId);
      }
      void this.reloadPickerOptions();
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not remove person');
    }
  }

  private async loadLeadPeople(leadId: string) {
    this.orgLoading.set(true);
    this.panelError.set(null);
    try {
      type LeadPersonRow = {
        id: string;
        firstName: string;
        lastName: string | null;
        title: string | null;
        phone: string | null;
        avatarUrl: string | null;
        isActive: boolean;
        autoCreated: boolean;
        emails: { email: string; isPrimary: boolean }[];
        accountLinks?: ContactSummary['accountLinks'];
      };
      const rows = await this.api.get<LeadPersonRow[]>(`/leads/${leadId}/people`);
      this.orgPeople.set(
        rows.map((r) => ({
          id: r.id,
          firstName: r.firstName,
          lastName: r.lastName,
          title: r.title,
          phone: r.phone,
          avatarUrl: r.avatarUrl,
          isActive: r.isActive,
          autoCreated: r.autoCreated,
          notes: null,
          tags: [],
          lastContactAt: null,
          emails: r.emails.map((e) => ({ id: e.email, email: e.email, isPrimary: e.isPrimary })),
          accountLinks: r.accountLinks ?? [],
        })),
      );
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Failed to load people');
      this.orgPeople.set([]);
    } finally {
      this.orgLoading.set(false);
    }
  }

  private async linkExistingToLead(option: PeopleDirectoryOption) {
    const leadId = this.leadId();
    if (!leadId) return;
    const contactId = contactIdFromDirectoryId(option.id);
    if (!contactId) {
      this.toast.add({ severity: 'warn', summary: 'People only', detail: 'Choose someone from People.' });
      return;
    }
    try {
      await this.api.post(`/leads/${leadId}/people`, { contactId });
    } catch {
      /* already on card */
    }
    if (this.leadContactSlot()) {
      await this.assignLeadSlot(contactId, option.displayName);
    } else {
      await this.loadLeadPeople(leadId);
      this.toast.add({ severity: 'success', summary: 'Person added', detail: option.displayName });
    }
    void this.reloadPickerOptions();
  }

  private leadSlotPatch(contactId: string | null): Record<string, unknown> {
    return this.leadContactSlot() === 'warm'
      ? { warmConnectionContactId: contactId }
      : { primaryContactId: contactId };
  }

  private async assignLeadSlot(contactId: string, displayName?: string) {
    const leadId = this.leadId();
    if (!leadId || !this.leadContactSlot()) return;
    const updated = await this.api.put<Record<string, unknown>>(`/leads/${leadId}`, this.leadSlotPatch(contactId));
    this.leadUpdated.emit(updated);
    await this.loadLeadSlotPerson();
    this.toast.add({
      severity: 'success',
      summary: 'Updated',
      detail: displayName ?? 'Person',
    });
  }

  async clearLeadSlot() {
    const slot = this.leadContactSlot();
    if (!slot) return;
    const leadId = this.leadId();
    if (!leadId) return;
    try {
      const updated = await this.api.put<Record<string, unknown>>(`/leads/${leadId}`, this.leadSlotPatch(null));
      this.leadUpdated.emit(updated);
      await this.loadLeadSlotPerson();
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not remove');
    }
  }

  private async loadLeadSlotPerson() {
    const slot = this.leadContactSlot();
    const leadId = this.leadId();
    if (!slot || !leadId) return;
    const contactId = slot === 'primary' ? this.primaryContactId() : this.warmConnectionContactId();
    this.orgLoading.set(true);
    this.panelError.set(null);
    try {
      if (!contactId) {
        this.orgPeople.set([]);
        return;
      }
      const c = await this.comms.contact(contactId);
      this.orgPeople.set([c]);
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Failed to load person');
      this.orgPeople.set([]);
    } finally {
      this.orgLoading.set(false);
    }
  }

  async removeProjectContact(index: number) {
    const projectId = this.projectId();
    if (!projectId) return;
    const next = this.projectPeople().filter((_, i) => i !== index);
    try {
      await this.persistProjectPeople(projectId, next);
      void this.reloadPickerOptions();
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not remove person');
    }
  }

  /** Where staff are saved: the client, or the saved project (a new project has none yet). */
  private teamScope(): TeamScope | null {
    if (!this.showTeam()) return null;
    if (this.mode() === 'organization') {
      const id = this.clientId();
      return id ? { kind: 'clients', id } : null;
    }
    const id = this.projectId();
    return id ? { kind: 'projects', id } : null;
  }

  private async loadTeam(scope: TeamScope) {
    try {
      this.teamRows.set(await this.team.list(scope));
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Failed to load team');
    }
  }

  private async addTeamMember(option: PeopleDirectoryOption) {
    const scope = this.teamScope();
    if (!scope) {
      this.toast.add({ severity: 'info', summary: 'Save first', detail: 'Save the project, then add team members.' });
      return;
    }
    this.teamRows.set(await this.team.add(scope, option.id.slice('user:'.length)));
    this.toast.add({ severity: 'success', summary: 'Person added', detail: option.displayName });
  }

  teamProjectsLine(m: TeamMember): string | null {
    if (!m.projects.length) return null;
    return `On ${m.projects.map((p) => p.name).join(', ')}`;
  }

  /** On a project, only admins and the project's Lead change who is on it (the API enforces this too). */
  readonly managesProjectPeople = computed(() => {
    const me = this.session.me();
    if (!me) return false;
    if (me.role === 'ADMIN') return true;
    return this.teamRows().some((m) => m.id === me.id && m.isLead);
  });

  async setLead(m: TeamMember, isLead: boolean) {
    const scope = this.teamScope();
    if (scope?.kind !== 'projects') return;
    try {
      this.teamRows.set(await this.team.setLead(scope.id, m.id, isLead));
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not change lead');
    }
  }

  async removeTeamMember(m: TeamMember) {
    const scope = this.teamScope();
    if (!scope) return;
    try {
      this.teamRows.set(await this.team.remove(scope, m.id));
      void this.reloadPickerOptions();
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Could not remove person');
    }
  }

  private async loadOrganizationPeople(clientId: string) {
    this.orgLoading.set(true);
    this.panelError.set(null);
    try {
      const list = await this.comms.contacts({ clientId });
      list.sort((a, b) => contactName(a).localeCompare(contactName(b)));
      this.orgPeople.set(list);
    } catch (err) {
      this.panelError.set(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      this.orgLoading.set(false);
    }
  }

  private async loadTeamCandidates(): Promise<Person[]> {
    if (!this.showTeam()) return [];
    if (!this.teamCandidates) {
      const kind = this.mode() === 'organization' ? 'clients' : 'projects';
      this.teamCandidates = await this.team.candidates(kind).catch(() => [] as Person[]);
    }
    return this.teamCandidates;
  }

  private async reloadPickerOptions() {
    this.pickerLoading.set(true);
    try {
      const excludeContactIds =
        this.mode() === 'organization'
          ? this.orgPeople().map((p) => p.id)
          : this.projectPeople()
              .map((r) => r.contactId)
              .filter((id): id is string => !!id);
      const [contacts, staff] = await Promise.all([
        this.peoplePicker.loadCrmContacts({
          excludeContactIds,
          excludeProjectId: this.projectId() ?? undefined,
        }),
        this.loadTeamCandidates(),
      ]);
      // Staff already shown as a direct member can't be added again (project roll-ups on a client can).
      const onTeam = new Set(this.teamRows().filter((m) => m.direct).map((m) => m.id));
      const staffOptions = toDirectoryOptions(
        staff
          .filter((p) => !onTeam.has(p.id))
          .map((p) => ({
            id: `user:${p.id}`,
            source: 'USER',
            sourceLabel: p.isGuest ? 'Guest collaborator' : 'Team member',
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            email: p.email,
            phone: '',
            displayName: p.name,
            avatarUrl: p.avatarUrl,
          })),
      );
      this.pickerOptions.set(toDirectoryOptions([...contacts, ...staffOptions]));
    } finally {
      this.pickerLoading.set(false);
    }
  }
}
