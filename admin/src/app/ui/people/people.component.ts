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
            <h3 class="card-title">People @if (hintKey()) { <app-help-text [key]="hintKey()!" /> }</h3>
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
            @if (clientId() && !readOnly()) {
              <p-button
                icon="pi pi-trash"
                [text]="true"
                severity="danger"
                size="small"
                class="people-panel-org-remove"
                [attr.aria-label]="'Remove ' + contactName(c) + ' from organization'"
                (onClick)="confirmUnlinkFromOrg(c)"
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
        } @empty {
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
    </div>

    @if (addPersonFlow() === 'modal') {
      <app-create-person-modal />
    }
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
  private readonly comms = inject(CommunicationsApi);
  private readonly peoplePicker = inject(PeoplePickerLoader);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly createPersonModal = viewChild(CreatePersonModalComponent);

  readonly contactName = contactName;

  /** `organization` = linked People on a client/org; `project` = project contact list (draft). */
  mode = input.required<PeoplePanelMode>();
  /** Organization id (required for organization mode). Also used when creating/linking from project. */
  clientId = input<string | null>(null);
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

  confirmUnlinkFromOrg(c: ContactSummary) {
    const clientId = this.clientId();
    if (!clientId) return;
    this.confirmDelete.confirm({
      message: `Remove "${contactName(c)}" from this organization? The person stays in People.`,
      accept: async () => {
        try {
          await this.comms.unlinkAccount(c.id, clientId);
          await this.loadOrganizationPeople(clientId);
          void this.reloadPickerOptions();
        } catch (err) {
          this.panelError.set(err instanceof Error ? err.message : 'Could not remove person');
        }
      },
    });
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
