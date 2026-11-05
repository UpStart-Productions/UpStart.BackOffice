import { Component, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import {
  CommunicationsApi,
  ContactSummary,
  contactName,
} from '../../core/communications.api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { contactIdFromDirectoryId, PeoplePickerLoader } from '../../core/people-picker.loader';
import { TeamApi, TeamMember, TeamScope } from '../../core/team.api';
import { PeopleDirectoryEntry } from '../../pages/projects/people-directory.types';
import { PeopleDirectoryOption, toDirectoryOptions } from '../../pages/projects/people-directory.util';
import { Person } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { CreatePersonModalComponent } from '../create-person-modal/create-person-modal.component';
import { PersonComponent } from '../person/person.component';
import { PeopleSelectComponent } from '../people-select/people-select.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';
import { PeoplePanelMode, PeopleProjectContact } from './people.types';

/**
 * Rubber-stamp People panel: pick existing (search), Add person (new-only modal), list.
 * Use on organizations/clients (`organization`) and projects (`project`).
 */
@Component({
  selector: 'app-people',
  standalone: true,
  imports: [
    ButtonModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    PersonComponent,
    CopyEmailComponent,
    TmAvatarComponent,
    RowActionsMenuComponent,
    PeopleSelectComponent,
    CreatePersonModalComponent,
    HelpTextComponent,
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

      @if (panelError()) {
        <p-message severity="error" [text]="panelError()!" class="mb-3" />
      }

      @if (!controlsAfterList() && !readOnly()) {
        <div class="form-field people-panel-picker">
          <label [attr.for]="pickerInputId">Add existing person</label>
          <app-people-select
            [inputId]="pickerInputId"
            [(pickId)]="pickId"
            (pickIdChange)="onExistingPicked($event)"
            [options]="pickerOptions()"
            [loading]="pickerLoading()"
            placeholder="Search and select…"
            ariaLabel="Add existing person"
          />
        </div>
      }

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
            <div class="people-panel-org-main">
              <div class="people-panel-org-name-line">
                <app-person
                  [name]="contactName(c)"
                  [firstName]="c.firstName"
                  [lastName]="c.lastName"
                  [email]="c.emails[0]?.email"
                  [avatarUrl]="c.avatarUrl"
                  [personId]="c.id"
                  [link]="['/people', c.id]"
                />
                @if (primaryContactPickerEnabled() && primaryContactId() === c.id) {
                  <p-tag value="Primary contact" severity="info" />
                }
                @if (c.autoCreated) {
                  <p-tag value="New" severity="info" />
                }
                @if (!c.isActive) {
                  <p-tag value="Inactive" severity="secondary" />
                }
              </div>
              @if (orgRole(c); as role) {
                <span class="people-panel-meta">{{ role }}</span>
              } @else if (c.title) {
                <span class="people-panel-meta">{{ c.title }}</span>
              }
              <app-copy-email [email]="c.emails[0]?.email" [muted]="true" [block]="true" />
            </div>
            @if ((clientId() || leadId()) && !readOnly()) {
              <app-row-actions-menu [items]="orgContactActions(c)" ariaLabel="Person actions" />
            }
          </div>
        }
        @for (m of teamRows(); track m.id) {
          <div class="people-panel-org-row">
            <div class="people-panel-org-main">
              <div class="people-panel-org-name-line">
                <app-person [name]="m.name" [firstName]="m.firstName" [lastName]="m.lastName" [email]="m.email" [avatarUrl]="m.avatarUrl" />
                <p-tag [value]="m.isGuest ? 'Guest' : 'Team'" severity="secondary" />
              </div>
              @if (teamProjectsLine(m); as line) {
                <span class="people-panel-meta">{{ line }}</span>
              }
              <app-copy-email [email]="m.email" [muted]="true" [block]="true" />
            </div>
            @if (m.direct && !readOnly()) {
              <p-button
                icon="pi pi-trash"
                [text]="true"
                severity="danger"
                size="small"
                class="people-panel-org-remove"
                [attr.aria-label]="'Remove ' + m.name + ' from organization'"
                (onClick)="confirmRemoveTeamMember(m)"
              />
            }
          </div>
        }
      } @else {
        @for (contact of projectContacts(); track $index; let rowIndex = $index) {
          <div class="people-panel-project-row">
            <app-tm-avatar [person]="projectRowPerson(contact)" [size]="36" [showTitle]="false" />
            <div class="people-panel-project-main">
              <span class="people-panel-project-name">{{ projectDisplayName(contact) || 'Unnamed' }}</span>
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
            @if (!embeddedInDialog() && !readOnly()) {
              <app-row-actions-menu [items]="projectRowActions(rowIndex)" ariaLabel="Contact actions" />
            }
          </div>
        }
        @for (m of teamRows(); track m.id) {
          <div class="people-panel-project-row">
            <app-tm-avatar [person]="m" [size]="36" [showTitle]="false" />
            <div class="people-panel-project-main">
              <div class="people-panel-org-name-line">
                <span class="people-panel-project-name">{{ m.name }}</span>
                <p-tag [value]="m.isGuest ? 'Guest' : 'Team'" severity="secondary" />
              </div>
              <div class="people-panel-project-details">
                <app-copy-email [email]="m.email" [muted]="true" />
              </div>
            </div>
            @if (!readOnly()) {
              <app-row-actions-menu [items]="teamRowActions(m)" ariaLabel="Team member actions" />
            }
          </div>
        }
        @if (projectContacts().length === 0 && teamRows().length === 0) {
          <p class="text-color-secondary mt-0 mb-0">No people on this project yet.</p>
        }

        @if (controlsAfterList() && !readOnly()) {
          <div class="people-panel-add-block">
            <div class="form-field people-panel-picker">
              <label [attr.for]="pickerInputId">Add existing person</label>
              <app-people-select
                [inputId]="pickerInputId"
                [(pickId)]="pickId"
                (pickIdChange)="onExistingPicked($event)"
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
      }

      <ng-content select="[peoplePanelExtra]" />

      @if (addPersonFlow() === 'modal') {
        <app-create-person-modal />
      }
    </div>
  `,
  styles: `
    .people-panel-picker {
      margin-bottom: 1rem;
    }
    .people-panel-org-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
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
      gap: 0.5rem;
      min-width: 0;
    }
    .people-panel-org-remove {
      flex-shrink: 0;
      margin-top: 0.1rem;
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
    .people-panel-project-name {
      font-weight: 600;
      line-height: 1.25;
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
      margin-top: 1rem;
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
  private readonly router = inject(Router);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly team = inject(TeamApi);
  private readonly createPersonModal = viewChild(CreatePersonModalComponent);

  readonly contactName = contactName;

  /** `organization` = linked People on a client/org; `project` = project contact list (draft). */
  mode = input.required<PeoplePanelMode>();
  /** Organization id (required for organization mode). Also used when creating/linking from project. */
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
      this.mode();
      this.clientId();
      this.projectId();
      this.projectContacts();
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

  orgContactActions(c: ContactSummary): RowActionItem[] {
    if (this.leadContactSlot()) {
      return [
        {
          id: 'remove',
          label: 'Remove',
          icon: 'pi pi-trash',
          severity: 'danger',
          command: () => this.confirmClearLeadSlot(),
        },
      ];
    }
    const items: RowActionItem[] = [];
    if (this.primaryContactPickerEnabled() && this.primaryContactId() !== c.id) {
      items.push({
        id: 'primary',
        label: 'Set as primary contact',
        icon: 'pi pi-star',
        command: () => this.setPrimaryContact.emit(c.id),
      });
    }
    items.push({
      id: 'remove',
      label: this.mode() === 'lead' ? 'Remove from card' : 'Remove from organization',
      icon: 'pi pi-trash',
      severity: 'danger',
      command: () => this.confirmUnlinkFromOrg(c),
    });
    return items;
  }

  async openNewPerson() {
    if (this.addPersonFlow() === 'delegate') {
      this.addPersonRequested.emit();
      return;
    }
    const clientId = this.clientId();
    const created = await this.createPersonModal()!.open({ clientId: clientId ?? undefined });
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
      this.addProjectContactFromSummary(created);
    }
    void this.reloadPickerOptions();
  }

  async onExistingPicked(id: string | null | undefined) {
    if (!id) return;
    const option = this.pickerOptions().find((o) => o.id === id);
    if (!option) return;
    this.panelError.set(null);
    try {
      if (option.id.startsWith('user:')) {
        await this.addTeamMember(option);
      } else if (this.mode() === 'organization') {
        await this.linkExistingToOrganization(option);
      } else if (this.mode() === 'lead') {
        await this.linkExistingToLead(option);
      } else {
        this.addProjectContactFromEntry(option);
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

  private addProjectContactFromEntry(entry: PeopleDirectoryEntry) {
    const contactId = contactIdFromDirectoryId(entry.id);
    if (!contactId) {
      this.toast.add({
        severity: 'warn',
        summary: 'People only',
        detail: 'Choose someone from People.',
      });
      return;
    }
    this.addProjectContactRow({
      contactId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      phone: entry.phone,
      email: entry.email,
      avatarUrl: entry.avatarUrl,
      displayName: entry.displayName,
    });
  }

  private addProjectContactFromSummary(c: ContactSummary) {
    const primaryEmail = c.emails.find((e) => e.isPrimary)?.email ?? c.emails[0]?.email ?? '';
    this.addProjectContactRow({
      contactId: c.id,
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      email: primaryEmail,
      avatarUrl: c.avatarUrl ?? null,
      displayName: contactName(c) || primaryEmail || 'Person',
    });
  }

  private addProjectContactRow(fields: {
    contactId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    avatarUrl: string | null;
    displayName: string;
  }) {
    const rows = this.projectContacts();
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
    const next = [
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
    this.projectContactsChange.emit(next);
    this.projectContactsDirty.emit();
    this.toast.add({ severity: 'success', summary: 'Person added', detail: fields.displayName });
    void this.reloadPickerOptions();
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

  confirmUnlinkFromOrg(c: ContactSummary) {
    const clientId = this.clientId();
    const leadId = this.leadId();
    if (!clientId && !leadId) return;
    const scope = this.mode() === 'lead' ? 'this pipeline card' : 'this organization';
    this.confirmDelete.confirm({
      message: `Remove "${contactName(c)}" from ${scope}? The person stays in People.`,
      accept: async () => {
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
      },
    });
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

  confirmClearLeadSlot() {
    const slot = this.leadContactSlot();
    if (!slot) return;
    const label = slot === 'primary' ? 'primary contact' : 'warm connect';
    this.confirmDelete.confirm({
      message: `Remove this person as ${label}? They stay in People.`,
      accept: async () => {
        const leadId = this.leadId();
        if (!leadId) return;
        try {
          const updated = await this.api.put<Record<string, unknown>>(`/leads/${leadId}`, this.leadSlotPatch(null));
          this.leadUpdated.emit(updated);
          await this.loadLeadSlotPerson();
          this.toast.add({ severity: 'success', summary: 'Removed' });
        } catch (err) {
          this.panelError.set(err instanceof Error ? err.message : 'Could not remove');
        }
      },
    });
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

  projectRowActions(index: number): RowActionItem[] {
    const contact = this.projectContacts()[index];
    const actions: RowActionItem[] = [];
    if (contact.contactId) {
      actions.push({
        id: 'open',
        label: 'Open in People',
        icon: 'pi pi-user',
        command: () => void this.router.navigate(['/people', contact.contactId!]),
      });
    }
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: 'pi pi-trash',
      severity: 'danger',
      command: () => this.confirmRemoveProjectContact(index),
    });
    return actions;
  }

  confirmRemoveProjectContact(index: number) {
    const contact = this.projectContacts()[index];
    const label = this.projectDisplayName(contact) || 'this person';
    this.confirmDelete.confirm({
      message: `Remove "${label}" from this project?`,
      accept: () => {
        const next = this.projectContacts().filter((_, i) => i !== index);
        this.projectContactsChange.emit(next);
        this.projectContactsDirty.emit();
        void this.reloadPickerOptions();
      },
    });
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

  teamRowActions(m: TeamMember): RowActionItem[] {
    return [
      {
        id: 'delete',
        label: 'Remove',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmRemoveTeamMember(m),
      },
    ];
  }

  confirmRemoveTeamMember(m: TeamMember) {
    const scope = this.teamScope();
    if (!scope) return;
    const where = scope.kind === 'projects' ? 'this project and its task board' : 'this organization';
    this.confirmDelete.confirm({
      message: `Remove "${m.name}" from ${where}?`,
      accept: async () => {
        try {
          this.teamRows.set(await this.team.remove(scope, m.id));
        } catch (err) {
          this.panelError.set(err instanceof Error ? err.message : 'Could not remove person');
        }
      },
    });
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
          : this.projectContacts()
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
