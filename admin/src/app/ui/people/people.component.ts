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
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { contactIdFromDirectoryId, PeoplePickerLoader } from '../../core/people-picker.loader';
import { PeopleDirectoryEntry } from '../../pages/projects/people-directory.types';
import { PeopleDirectoryOption } from '../../pages/projects/people-directory.util';
import { Person } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { CreatePersonModalComponent } from '../create-person-modal/create-person-modal.component';
import { PersonComponent } from '../person/person.component';
import { PeopleSelectComponent } from '../people-select/people-select.component';
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
  ],
  template: `
    <div class="card people-panel" [class.card--side]="compact()" [class.people-panel--compact]="compact()">
      <div class="card-header">
        <h3 class="card-title">People</h3>
        <p-button
          type="button"
          label="Add person"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          (onClick)="openNewPerson()"
        />
      </div>

      @if (panelError()) {
        <p-message severity="error" [text]="panelError()!" class="mb-3" />
      }

      @if (hintText()) {
        <p class="text-color-secondary mt-0 mb-3 text-sm">{{ hintText() }}</p>
      }

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

      @if (mode() === 'organization') {
        @if (orgLoading() && orgPeople().length === 0) {
          <div aria-busy="true" aria-label="Loading people">
            @for (n of skeletonRows; track n) {
              <div class="people-panel-org-row"><p-skeleton width="40%" height="1rem" /></div>
            }
          </div>
        } @else if (orgPeople().length === 0) {
          <div class="empty-state">
            <i class="pi pi-users" aria-hidden="true"></i>
            <p>No people linked yet.</p>
          </div>
        }
        @for (c of orgPeople(); track c.id) {
          <div class="people-panel-org-row">
            <div class="people-panel-org-main">
              <app-person
                [name]="contactName(c)"
                [firstName]="c.firstName"
                [lastName]="c.lastName"
                [email]="c.emails[0]?.email"
                [avatarUrl]="c.avatarUrl"
                [personId]="c.id"
                [link]="['/people', c.id]"
              />
              @if (c.autoCreated) {
                <p-tag value="New" severity="info" />
              }
              @if (!c.isActive) {
                <p-tag value="Inactive" severity="secondary" />
              }
              @if (orgRole(c); as role) {
                <span class="people-panel-meta">{{ role }}</span>
              } @else if (c.title) {
                <span class="people-panel-meta">{{ c.title }}</span>
              }
            </div>
            <div class="people-panel-org-email">
              <app-copy-email [email]="c.emails[0]?.email" [muted]="true" />
            </div>
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
              } @else if (contact.email) {
                <span class="people-panel-meta">{{ contact.email }}</span>
              } @else if (contact.phone) {
                <span class="people-panel-meta">{{ contact.phone }}</span>
              }
            </div>
            <app-row-actions-menu [items]="projectRowActions(rowIndex)" ariaLabel="Contact actions" />
          </div>
        } @empty {
          <p class="text-color-secondary mt-0 mb-0">No people on this project yet.</p>
        }
      }
    </div>

    <app-create-person-modal />
  `,
  styles: `
    .people-panel-picker {
      margin-bottom: 1rem;
    }
    .people-panel-org-row {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 2fr);
      gap: 1rem;
      align-items: center;
      padding: 0.6rem 0;
      border-top: 1px solid var(--surface-border, #e5e7eb);
    }
    .people-panel-org-row:first-of-type {
      border-top: 0;
    }
    .people-panel-org-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
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
    .people-panel--compact .people-panel-org-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }
    @media (max-width: 40rem) {
      .people-panel-org-row {
        grid-template-columns: 1fr;
        gap: 0.25rem;
      }
    }
  `,
})
export class PeopleComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly peoplePicker = inject(PeoplePickerLoader);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly createPersonModal = viewChild.required(CreatePersonModalComponent);

  readonly contactName = contactName;

  /** `organization` = linked People on a client/org; `project` = project contact list (draft). */
  mode = input.required<PeoplePanelMode>();
  /** Organization id (required for organization mode). Also used when creating/linking from project. */
  clientId = input<string | null>(null);
  /** Side-panel layout (narrow column). */
  compact = input(false);
  /** Override default hint; omit for built-in copy. */
  hint = input<string | null>(null);
  /** When picking on a project, omit people already on this project. */
  projectId = input<string | null>(null);

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
  orgLoading = signal(false);
  readonly skeletonRows = [1, 2];

  readonly hintText = () => {
    const custom = this.hint();
    if (custom !== null) return custom;
    if (this.mode() === 'project') {
      return 'Client-side contacts for invoicing and communication. Each person lives in People; save the project to refresh their details from the profile.';
    }
    return null;
  };

  constructor() {
    effect(() => {
      if (this.mode() !== 'organization') return;
      const id = this.clientId();
      if (!id) return;
      void this.loadOrganizationPeople(id);
    });
    effect(() => {
      this.mode();
      this.clientId();
      this.projectId();
      this.projectContacts();
      this.orgPeople();
      void this.reloadPickerOptions();
    });
  }

  orgRole(c: ContactSummary): string | null {
    const id = this.clientId();
    if (!id) return null;
    return c.accountLinks.find((l) => l.clientId === id)?.role ?? null;
  }

  async openNewPerson() {
    const clientId = this.clientId();
    const created = await this.createPersonModal().open({ clientId: clientId ?? undefined });
    if (!created) return;
    if (this.mode() === 'organization' && clientId) {
      await this.loadOrganizationPeople(clientId);
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
      if (this.mode() === 'organization') {
        await this.linkExistingToOrganization(option);
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

  private async reloadPickerOptions() {
    this.pickerLoading.set(true);
    try {
      const excludeContactIds =
        this.mode() === 'organization'
          ? this.orgPeople().map((p) => p.id)
          : this.projectContacts()
              .map((r) => r.contactId)
              .filter((id): id is string => !!id);
      this.pickerOptions.set(
        await this.peoplePicker.loadCrmContacts({
          excludeContactIds,
          excludeProjectId: this.projectId() ?? undefined,
        }),
      );
    } finally {
      this.pickerLoading.set(false);
    }
  }
}
