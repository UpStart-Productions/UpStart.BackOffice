import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import type Quill from 'quill';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { PageComponent } from '../../ui/layout/page.component';
import { PersonComponent } from '../../ui/person/person.component';
import { CrmTagInputComponent } from '../../ui/crm-tags/crm-tag-input.component';
import { AvatarDropzoneComponent } from '../../ui/avatar-dropzone/avatar-dropzone.component';
import { OrganizationLinksComponent } from '../../ui/organization-links/organization-links.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

@Component({
  selector: 'app-contact-detail-page',
  standalone: true,
  imports: [PersonComponent, 
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TagModule,
    QuillModule,
    PageComponent,
    ActivityTimelineComponent,
    CrmTagInputComponent,
    AvatarDropzoneComponent,
    OrganizationLinksComponent,
    HelpTextComponent,
  ],
  template: `
    <app-page title="Person" [skipTitle]="true">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      @if (contact(); as c) {
        <div class="grid grid-3">
          <div class="stack span-2">
            <div class="card">
              <div class="page-header-with-back">
                <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" severity="secondary" routerLink="/people" aria-label="Back to People" />
                <app-person [name]="name(c)" [firstName]="c.firstName" [lastName]="c.lastName" [email]="c.emails[0]?.email" [avatarUrl]="c.avatarUrl" [personId]="c.id" [size]="40" [avatarOnly]="true" />
                <div class="person-header-text">
                  <h2 class="page-title page-title-in-card mb-0">{{ name(c) }}</h2>
                  @if (form.title.trim()) {
                    <span class="text-color-secondary text-sm">{{ form.title }}</span>
                  }
                </div>
              </div>

              @if (c.autoCreated) {
                <p-message severity="info" styleClass="review-message" class="block mb-3">
                  <div class="review-banner">
                    <span>Created automatically from an email. Check the details, then mark it reviewed.</span>
                    <p-button label="Mark reviewed" size="small" (onClick)="markReviewed()" />
                  </div>
                </p-message>
              }

              <div class="person-profile-form">
                <div class="form-row">
                  <div class="form-field">
                    <label for="firstName">First name</label>
                    <input pInputText id="firstName" [(ngModel)]="form.firstName" class="w-full" />
                  </div>
                  <div class="form-field">
                    <label for="lastName">Last name</label>
                    <input pInputText id="lastName" [(ngModel)]="form.lastName" class="w-full" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-field">
                    <label for="primaryEmail">Email</label>
                    <input pInputText id="primaryEmail" type="email" [(ngModel)]="form.primaryEmail" class="w-full" />
                  </div>
                  <div class="form-field">
                    <label for="title">Title</label>
                    <input pInputText id="title" [(ngModel)]="form.title" class="w-full" />
                  </div>
                </div>
                <div class="form-field">
                  <label for="phone">Phone</label>
                  <input pInputText id="phone" [(ngModel)]="form.phone" class="w-full" />
                </div>
                <div class="form-field showcase-full">
                  <label for="notes">Notes</label>
                  <quill-editor
                    id="notes"
                    name="notes"
                    [(ngModel)]="form.notes"
                    placeholder="Notes…"
                    [styles]="{ 'min-height': '140px' }"
                    (onEditorCreated)="onNotesEditor($event)"
                  ></quill-editor>
                </div>
                <div class="form-field showcase-full">
                  <label for="personTags">Tags</label>
                  <app-crm-tag-input [(tags)]="form.tags" inputId="personTags" />
                </div>
              </div>
              <div class="form-actions">
                <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!dirty()" (onClick)="save()" />
                @if (canDelete()) {
                  <p-button label="Delete person" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDeletePerson()" />
                }
              </div>
            </div>

            <app-activity-timeline [contactId]="c.id" />
          </div>

          <div class="stack span-1">
            <div class="card card--side">
              <app-avatar-dropzone
                #avatarDropzone
                [panel]="true"
                [existingUrl]="c.avatarUrl"
                (fileChange)="onAvatarFile($event)"
                (invalidFile)="onAvatarError($event)"
              />
            </div>

            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Email addresses <app-help-text key="contact.emailAddresses" /></h3>
              </div>
              @for (e of c.emails; track e.id) {
                <div class="side-row-line">
                  <span class="side-row-line-main">{{ e.email }}</span>
                  @if (e.isPrimary) {
                    <p-tag value="Primary" severity="info" />
                  } @else {
                    <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmRemoveEmail(e.email)" aria-label="Remove email" />
                  }
                </div>
              }
              <div class="side-row-line side-row-line--add">
                <input pInputText type="email" [(ngModel)]="newEmail" placeholder="Add an email address" class="w-full" />
                <p-button label="Add" icon="pi pi-plus" severity="secondary" size="small" [disabled]="!newEmail.trim()" (onClick)="addEmail()" />
              </div>
            </div>

            <app-organization-links [contact]="c" (contactChange)="apply($event)" />
          </div>
        </div>
      }
    </app-page>
  `,
  styles: `
    :host ::ng-deep .review-message .p-message-text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .review-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      font-size: var(--fs-sm);
      line-height: 1.35;
    }
    .review-banner p-button {
      margin-left: auto;
      flex-shrink: 0;
    }
    .person-header-text {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
    }
    .person-profile-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-row {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }
    .form-row .form-field {
      flex: 1 1 0;
      min-width: 0;
    }
    .side-row-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--surface-border);
    }
    .card-header + p + .side-row-line,
    .side-row-line:first-of-type {
      border-top: 0;
      padding-top: 0;
    }
    .side-row-line-main {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-word;
    }
    .side-row-line--add {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
      border-top: 0;
      padding-top: 0.75rem;
    }
  `,
})
export class ContactDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);
  readonly canDelete = () => this.session.can('contacts', 'delete');
  private readonly avatarDropzone = viewChild<AvatarDropzoneComponent>('avatarDropzone');

  contact = signal<ContactSummary | null>(null);
  error = signal<string | null>(null);
  saving = signal(false);

  form = {
    firstName: '',
    lastName: '',
    title: '',
    primaryEmail: '',
    phone: '',
    notes: '',
    isActive: true,
    tags: [] as string[],
  };
  newEmail = '';

  name = contactName;

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    try {
      this.apply(await this.comms.contact(id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load person');
    }
  }

  apply(c: ContactSummary) {
    this.contact.set(c);
    const primary = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
    this.form = {
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      title: c.title ?? '',
      primaryEmail: primary?.email ?? '',
      phone: c.phone ?? '',
      notes: c.notes ?? '',
      isActive: c.isActive,
      tags: [...(c.tags ?? [])],
    };
    this.avatarDropzone()?.reset();
  }

  async onAvatarFile(file: File | null) {
    const c = this.contact();
    if (!c) return;
    if (!file) {
      if (!c.avatarUrl) return;
      this.confirm.confirm({
        header: 'Remove photo',
        message: 'Remove this photo?',
        accept: async () => {
          try {
            this.apply(await this.comms.removeAvatar(c.id));
          } catch (err) {
            this.fail(err, 'Could not remove photo');
          }
        },
      });
      return;
    }
    try {
      await this.api.uploadAvatar(`/contacts/${c.id}/avatar`, file);
      this.apply(await this.comms.contact(c.id));
    } catch (err) {
      this.avatarDropzone()?.reset();
      this.fail(err, 'Could not save photo');
    }
  }

  onAvatarError(message: string) {
    this.toast.add({ severity: 'warn', summary: 'Photo', detail: message });
  }

  private primaryEmailOnRecord(c: ContactSummary): string {
    const primary = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
    return primary?.email ?? '';
  }

  /** True when the form differs from the saved contact. */
  dirty(): boolean {
    const c = this.contact();
    if (!c) return false;
    const f = this.form;
    return (
      f.firstName !== c.firstName ||
      f.lastName !== (c.lastName ?? '') ||
      f.title !== (c.title ?? '') ||
      f.primaryEmail.trim() !== this.primaryEmailOnRecord(c) ||
      f.phone !== (c.phone ?? '') ||
      f.notes !== (c.notes ?? '') ||
      f.isActive !== c.isActive ||
      f.tags.join('\n') !== (c.tags ?? []).join('\n')
    );
  }

  private fail(err: unknown, fallback: string) {
    this.toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : fallback });
  }

  async save() {
    const c = this.contact();
    if (!c) return;
    if (!this.form.firstName.trim()) {
      this.toast.add({ severity: 'warn', summary: 'Missing name', detail: 'First name is required.' });
      return;
    }
    this.saving.set(true);
    try {
      let updated = await this.comms.updateContact(c.id, {
        firstName: this.form.firstName,
        lastName: this.form.lastName,
        title: this.form.title,
        phone: this.form.phone,
        notes: richTextOrUndefined(this.form.notes),
        isActive: this.form.isActive,
        tags: this.form.tags,
      });
      const nextEmail = this.form.primaryEmail.trim();
      const savedEmail = this.primaryEmailOnRecord(updated);
      if (nextEmail !== savedEmail) {
        if (savedEmail && !nextEmail) {
          updated = await this.comms.removeEmail(updated.id, savedEmail);
        } else if (nextEmail) {
          updated = await this.comms.addEmail(updated.id, nextEmail, true);
        }
      }
      this.apply(updated);
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Person saved.' });
    } catch (err) {
      this.fail(err, 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async markReviewed() {
    const c = this.contact();
    if (!c) return;
    try {
      this.apply(await this.comms.updateContact(c.id, { autoCreated: false }));
    } catch (err) {
      this.fail(err, 'Update failed');
    }
  }

  async addEmail() {
    const c = this.contact();
    if (!c) return;
    try {
      this.apply(await this.comms.addEmail(c.id, this.newEmail.trim()));
      this.newEmail = '';
    } catch (err) {
      this.fail(err, 'Could not add email');
    }
  }

  confirmRemoveEmail(email: string) {
    const c = this.contact();
    if (c?.emails.some((e) => e.isPrimary && e.email === email)) return;
    this.confirm.confirm({
      header: 'Remove email',
      message: `Remove ${email}? Mail from this address will no longer match this person.`,
      accept: async () => {
        const c = this.contact();
        if (!c) return;
        try {
          this.apply(await this.comms.removeEmail(c.id, email));
        } catch (err) {
          this.fail(err, 'Could not remove email');
        }
      },
    });
  }

  confirmDeletePerson() {
    const c = this.contact();
    if (!c) return;
    this.confirm.confirm({
      message: `Delete "${contactName(c)}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.comms.deleteContact(c.id);
          await this.router.navigate(['/people']);
        } catch (err) {
          this.fail(err, 'Delete failed');
        }
      },
    });
  }

  onNotesEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const contactId = this.contact()?.id;
      return contactId ? { type: 'contact', contactId } : { type: 'crm' };
    });
  }

}
