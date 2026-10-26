import { Component, inject, input, model, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { MessageModule } from 'primeng/message';
import { ContactSummary, contactName } from '../../core/communications.api';
import { CreatePersonFormComponent } from '../../ui/create-person-modal/create-person-form.component';
import { PeopleComponent } from '../../ui/people/people.component';
import { PeopleProjectContact } from '../../ui/people/people.types';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { TmApiService } from '../core/tm-api.service';
import { Person, TmProject, TmProjectContact } from '../core/tm.types';
import { TmAvatarComponent } from './tm-avatar.component';

type ContactsView = 'list' | 'newPerson';

/** Project client contacts (from the Projects page), opened from the Tasks project menu. */
@Component({
  selector: 'app-tm-contacts-dialog',
  standalone: true,
  imports: [
    RouterLink,
    AppDialogModule,
    ButtonModule,
    MessageModule,
    PeopleComponent,
    CreatePersonFormComponent,
    TmAvatarComponent,
    CopyEmailComponent,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '36rem' }"
      (onShow)="reset()"
      [draggable]="false"
      [closable]="view() === 'list'"
    >
      <ng-template pTemplate="header">
        <div class="tm-contacts-dialog-header">
          @if (view() === 'newPerson') {
            <button
              type="button"
              class="tm-icon-btn"
              aria-label="Back to project contacts"
              (click)="showList()"
            >
              <i class="pi pi-arrow-left"></i>
            </button>
            <span class="tm-contacts-dialog-title">New person</span>
          } @else {
            <span class="tm-contacts-dialog-title">Project contacts</span>
          }
        </div>
      </ng-template>

      @if (view() === 'list') {
        <p class="tm-share-hint mt-0">
          Client-side contacts for invoicing and communication. Each person lives in People; details refresh from their profile when you save.
        </p>
        @if (error()) {
          <p-message severity="error" [text]="error()!" styleClass="mb-3" />
        }

        @if (project().permissions.canEdit) {
          <app-people
            mode="project"
            addPersonFlow="delegate"
            (addPersonRequested)="showNewPerson()"
            [clientId]="project().client?.id ?? null"
            [projectId]="project().id"
            [compact]="true"
            [projectContacts]="rows()"
            (projectContactsChange)="rows.set($event)"
          />
          <div class="form-actions mt-3">
            <button type="button" pButton label="Save" [loading]="busy()" (click)="save()"></button>
          </div>
        } @else {
          <ul class="tm-contact-readonly">
            @for (c of project().contacts; track c.id) {
              <li class="tm-contact-readonly-row">
                <app-tm-avatar [person]="asPerson(c)" [size]="32" [showTitle]="false" />
                <div class="tm-contact-readonly-main">
                  @if (c.contactId) {
                    <a [routerLink]="['/people', c.contactId]" class="tm-contact-name">{{ displayName(c) }}</a>
                  } @else {
                    <span class="tm-contact-name">{{ displayName(c) || 'Unnamed' }}</span>
                  }
                  @if (c.email) {
                    <app-copy-email [email]="c.email" [muted]="true" />
                  } @else if (c.phone) {
                    <span class="tm-muted text-sm">{{ c.phone }}</span>
                  }
                </div>
              </li>
            } @empty {
              <li class="tm-muted">No project contacts yet.</li>
            }
          </ul>
        }
      } @else {
        <app-create-person-form
          #newPersonForm
          [defaultClientId]="project().client?.id ?? null"
          [showOrgPicker]="false"
          (created)="onPersonCreated($event)"
          (cancelled)="showList()"
        />
      }
    </p-dialog>
  `,
  styles: `
    .tm-contacts-dialog-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .tm-contacts-dialog-title {
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .tm-contact-readonly {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tm-contact-readonly-row {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--surface-border);
    }
    .tm-contact-readonly-row:first-child {
      border-top: 0;
    }
    .tm-contact-readonly-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .tm-contact-name {
      font-weight: 600;
      line-height: 1.25;
      color: inherit;
      text-decoration: none;
    }
    a.tm-contact-name:hover {
      text-decoration: underline;
    }
  `,
})
export class TmContactsDialogComponent {
  private readonly api = inject(TmApiService);
  private readonly toast = inject(MessageService);
  private readonly newPersonForm = viewChild<CreatePersonFormComponent>('newPersonForm');

  project = input.required<TmProject>();
  visible = model(false);
  updated = output<TmProject>();

  view = signal<ContactsView>('list');
  rows = signal<PeopleProjectContact[]>([]);
  busy = signal(false);
  error = signal<string | null>(null);

  reset() {
    this.view.set('list');
    this.error.set(null);
    this.rows.set(this.project().contacts.map(toPeopleRow));
  }

  showList() {
    this.view.set('list');
  }

  showNewPerson() {
    this.view.set('newPerson');
    queueMicrotask(() => this.newPersonForm()?.reset());
  }

  onPersonCreated(c: ContactSummary) {
    const primaryEmail = c.emails.find((e) => e.isPrimary)?.email ?? c.emails[0]?.email ?? '';
    const displayName = contactName(c) || primaryEmail || 'Person';
    const rows = this.rows();
    if (rows.some((row) => row.contactId === c.id)) {
      this.toast.add({ severity: 'info', summary: 'Already on this project', detail: `${displayName} is already listed.` });
      this.showList();
      return;
    }
    const email = primaryEmail.trim().toLowerCase();
    if (email && rows.some((row) => row.email.trim().toLowerCase() === email)) {
      this.toast.add({ severity: 'info', summary: 'Already on this project', detail: `${displayName} is already listed.` });
      this.showList();
      return;
    }
    this.rows.set([
      ...rows,
      {
        contactId: c.id,
        firstName: c.firstName,
        lastName: c.lastName ?? '',
        phone: c.phone ?? '',
        email: primaryEmail,
        avatarUrl: c.avatarUrl ?? null,
        sortOrder: rows.length,
      },
    ]);
    this.toast.add({ severity: 'success', summary: 'Person added', detail: displayName });
    this.showList();
  }

  displayName(c: TmProjectContact): string {
    return [c.firstName, c.lastName]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(' ');
  }

  asPerson(c: TmProjectContact): Person {
    const name = this.displayName(c) || c.email || 'Contact';
    return {
      id: c.contactId ?? c.id,
      name,
      email: c.email || name,
      firstName: c.firstName || null,
      lastName: c.lastName || null,
      avatarUrl: c.avatarUrl,
      role: 'USER',
      isGuest: false,
    };
  }

  async save() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const contacts = this.rows()
        .map((contact, index) => ({
          id: contact.id,
          contactId: contact.contactId ?? undefined,
          firstName: contact.firstName.trim() || undefined,
          lastName: contact.lastName.trim() || undefined,
          phone: contact.phone.trim() || undefined,
          email: contact.email.trim() || undefined,
          sortOrder: index,
        }))
        .filter(
          (c) => c.contactId || c.firstName || c.lastName || c.phone || c.email,
        );
      const project = await this.api.syncProjectContacts(this.project().id, contacts);
      this.updated.emit(project);
      this.visible.set(false);
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Project contacts updated.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.busy.set(false);
    }
  }
}

function toPeopleRow(c: TmProjectContact): PeopleProjectContact {
  return {
    id: c.id,
    contactId: c.contactId,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    email: c.email,
    sortOrder: c.sortOrder,
    avatarUrl: c.avatarUrl,
  };
}
