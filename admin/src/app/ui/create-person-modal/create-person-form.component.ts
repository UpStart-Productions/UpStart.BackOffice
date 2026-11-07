import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PhoneInputComponent } from '../phone-input/phone-input.component';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { CommunicationsApi, ContactSummary } from '../../core/communications.api';
import { TagInputComponent } from '../tag-input/tag-input.component';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { AvatarDropzoneComponent } from '../avatar-dropzone/avatar-dropzone.component';
import { HelpTextComponent } from '../help-text/help-text.component';

/** Sentinel value in the organization picker for inline org creation. */
export const NEW_ORGANIZATION_OPTION_ID = '__new_organization__';

type OrgOption = { id: string; name: string };

/** The new contact, plus whether to make them the project's Lead (they then get a Guest login). */
export type CreatedPerson = ContactSummary & { makeLead?: boolean; leadEmail?: string };

/** New-person fields (used inside a dialog or inline panel). */
@Component({
  selector: 'app-create-person-form',
  standalone: true,
  imports: [
    FormsModule,
    CheckboxModule,
    ButtonModule,
    InputTextModule,
    PhoneInputComponent,
    MessageModule,
    SelectModule,
    TagInputComponent,
    AvatarDropzoneComponent,
    HelpTextComponent,
  ],
  styles: `
    .new-form {
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
    .org-stub {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--border-radius);
      background: var(--surface-ground);
    }
    .org-stub-title {
      margin: 0;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }
  `,
  template: `
    <div class="new-form">
      <app-avatar-dropzone
        #avatarDropzone
        (fileChange)="onAvatarFile($event)"
        (invalidFile)="formError.set($event)"
      />
      <div class="form-row">
        <div class="form-field">
          <label for="nFirst">First name</label>
          <input pInputText id="nFirst" [(ngModel)]="form.firstName" class="w-full" />
        </div>
        <div class="form-field">
          <label for="nLast">Last name</label>
          <input pInputText id="nLast" [(ngModel)]="form.lastName" class="w-full" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="nEmail">Email</label>
          <input pInputText id="nEmail" type="email" [(ngModel)]="form.email" class="w-full" />
        </div>
        <div class="form-field">
          <label for="nPhone">Phone</label>
          <app-phone-input inputId="nPhone" [value]="form.phone || null" (valueChange)="form.phone = $event ?? ''" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="nTitle">Title</label>
          <input pInputText id="nTitle" [(ngModel)]="form.title" class="w-full" placeholder="e.g. Executive Director" />
        </div>
        <div class="form-field">
          <label for="nLinkedIn">LinkedIn URL</label>
          <input pInputText id="nLinkedIn" type="url" [(ngModel)]="form.linkedInUrl" class="w-full" placeholder="https://linkedin.com/in/…" />
        </div>
      </div>
      <div class="form-field">
        <label for="nPersonalUrl">Personal URL</label>
        <input pInputText id="nPersonalUrl" type="url" [(ngModel)]="form.personalUrl" class="w-full" placeholder="https://…" />
      </div>
      @if (showOrgPicker()) {
        <div class="form-field">
          <label for="nClient">Organization (optional)</label>
          <p-select
            inputId="nClient"
            [options]="orgOptions()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="form.clientId"
            [filter]="true"
            filterBy="name"
            [showClear]="true"
            placeholder="Link to an organization"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
        @if (creatingOrg()) {
          <div class="org-stub">
            <p class="org-stub-title">New organization</p>
            <div class="form-field">
              <label for="nOrgName">Organization name</label>
              <input pInputText id="nOrgName" [(ngModel)]="form.newOrg.name" class="w-full" />
            </div>
            <div class="form-row">
              <div class="form-field">
                <label for="nOrgEmail">Organization email</label>
                <input pInputText id="nOrgEmail" type="email" [(ngModel)]="form.newOrg.email" class="w-full" />
              </div>
              <div class="form-field">
                <label for="nOrgWebsite">Website</label>
                <input pInputText id="nOrgWebsite" type="url" [(ngModel)]="form.newOrg.website" class="w-full" placeholder="https://…" />
              </div>
            </div>
          </div>
        }
      }
      @if (linkingOrg()) {
        <div class="form-field">
          <label for="nRole">Role at organization <app-help-text key="person.orgRole" /></label>
          <input pInputText id="nRole" [(ngModel)]="form.role" class="w-full" placeholder="e.g. Board member" />
        </div>
      }
      <div class="form-field">
        <label for="nTags">Tags (optional)</label>
        <app-crm-tag-input [(tags)]="form.tags" inputId="nTags" />
      </div>
      @if (showLeadOption()) {
        <div class="flex align-items-center gap-2">
          <p-checkbox inputId="nMakeLead" [(ngModel)]="form.makeLead" [binary]="true" />
          <label for="nMakeLead">Make lead <app-help-text key="project.team.newLead" /></label>
        </div>
      }
      @if (formError()) {
        <p-message severity="error" [text]="formError()!" />
      }
      <div class="form-actions">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="cancelled.emit()" />
        <p-button label="Create" icon="pi pi-check" [loading]="saving()" (onClick)="saveNew()" />
      </div>
    </div>
  `,
})
export class CreatePersonFormComponent {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly crmTags = inject(CrmTagsApi);
  private readonly avatarDropzone = viewChild<AvatarDropzoneComponent>('avatarDropzone');

  /** When set, organization picker is hidden and this client is pre-selected. */
  defaultClientId = input<string | null>(null);
  defaultRole = input('');
  /** Show organization picker (false when defaultClientId is fixed). */
  showOrgPicker = input(true);
  /** On a saved project: offer "Make lead" (invites them as a Guest and makes them the project's Lead). */
  showLeadOption = input(false);

  created = output<CreatedPerson>();
  cancelled = output<void>();

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly clients = signal<OrgOption[]>([]);

  readonly orgOptions = computed(() => {
    const list = this.clients();
    const newOpt: OrgOption = { id: NEW_ORGANIZATION_OPTION_ID, name: 'New organization' };
    return [newOpt, ...list];
  });

  private selectedAvatarFile: File | null = null;

  form = this.emptyForm();

  reset() {
    void this.crmTags.load();
    this.form = this.emptyForm();
    this.formError.set(null);
    this.selectedAvatarFile = null;
    this.avatarDropzone()?.reset();
    void this.loadClients(true);
  }

  creatingOrg(): boolean {
    return this.form.clientId === NEW_ORGANIZATION_OPTION_ID;
  }

  linkingOrg(): boolean {
    return !!this.form.clientId;
  }

  private emptyForm() {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      title: '',
      linkedInUrl: '',
      personalUrl: '',
      clientId: this.defaultClientId() as string | null,
      role: this.defaultRole(),
      tags: [] as string[],
      newOrg: { name: '', email: '', website: '' },
      makeLead: false,
    };
  }

  private async loadClients(force = false) {
    if (!this.showOrgPicker() && this.defaultClientId()) return;
    if (!force && this.clients().length > 0) return;
    try {
      this.clients.set(await this.api.get<OrgOption[]>('/clients'));
    } catch {
      this.clients.set([]);
    }
  }

  onAvatarFile(file: File | null) {
    this.selectedAvatarFile = file;
    if (file) this.formError.set(null);
  }

  async saveNew() {
    if (!this.form.firstName.trim()) {
      this.formError.set('First name is required.');
      return;
    }
    if (this.showLeadOption() && this.form.makeLead && !this.form.email.trim()) {
      this.formError.set('Email is required to make them the Lead. They need it to sign in.');
      return;
    }
    if (this.creatingOrg() && !this.form.newOrg.name.trim()) {
      this.formError.set('Organization name is required when creating a new organization.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      let clientId = this.form.clientId;
      if (clientId === NEW_ORGANIZATION_OPTION_ID) {
        const org = this.form.newOrg;
        const created = await this.api.post<{ id: string }>('/clients', {
          name: org.name.trim(),
          email: org.email.trim() || undefined,
          website: org.website.trim() || undefined,
          journey: 'NONE',
          addToPipeline: false,
        });
        clientId = created.id;
      }

      const created = await this.comms.createContact({
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim() || undefined,
        email: this.form.email.trim() || undefined,
        phone: this.form.phone.trim() || undefined,
        title: this.form.title.trim() || undefined,
        linkedInUrl: this.form.linkedInUrl.trim() || undefined,
        personalUrl: this.form.personalUrl.trim() || undefined,
        clientId: clientId ?? undefined,
        role: clientId ? this.form.role.trim() || undefined : undefined,
        tags: this.form.tags.length ? this.form.tags : undefined,
      });
      let result = created;
      if (this.selectedAvatarFile) {
        await this.api.uploadAvatar<{ url: string }>(
          `/contacts/${created.id}/avatar`,
          this.selectedAvatarFile,
        );
        result = await this.comms.contact(created.id);
      }
      void this.crmTags.load(true);
      const makeLead = this.showLeadOption() && this.form.makeLead;
      this.created.emit(makeLead ? { ...result, makeLead, leadEmail: this.form.email.trim() } : result);
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.saving.set(false);
    }
  }
}
