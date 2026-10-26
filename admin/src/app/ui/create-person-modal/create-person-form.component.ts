import { Component, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { CommunicationsApi, ContactSummary } from '../../core/communications.api';
import { CrmTagInputComponent } from '../crm-tags/crm-tag-input.component';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { AvatarDropzoneComponent } from '../avatar-dropzone/avatar-dropzone.component';
import { HelpTextComponent } from '../help-text/help-text.component';

/** New-person fields (used inside a dialog or inline panel). */
@Component({
  selector: 'app-create-person-form',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    CrmTagInputComponent,
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
          <label for="nTitle">Title</label>
          <input pInputText id="nTitle" [(ngModel)]="form.title" class="w-full" placeholder="e.g. Executive Director" />
        </div>
      </div>
      @if (showOrgPicker()) {
        <div class="form-field">
          <label for="nClient">Organization (optional)</label>
          <p-select
            inputId="nClient"
            [options]="clients()"
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
      }
      @if (form.clientId) {
        <div class="form-field">
          <label for="nRole">Role at organization <app-help-text key="person.orgRole" /></label>
          <input pInputText id="nRole" [(ngModel)]="form.role" class="w-full" placeholder="e.g. Board member" />
        </div>
      }
      <div class="form-field">
        <label for="nTags">Tags (optional)</label>
        <app-crm-tag-input [(tags)]="form.tags" inputId="nTags" />
      </div>
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

  created = output<ContactSummary>();
  cancelled = output<void>();

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly clients = signal<{ id: string; name: string }[]>([]);

  private selectedAvatarFile: File | null = null;

  form = {
    firstName: '',
    lastName: '',
    email: '',
    title: '',
    clientId: null as string | null,
    role: '',
    tags: [] as string[],
  };

  reset() {
    void this.crmTags.load();
    this.form = {
      firstName: '',
      lastName: '',
      email: '',
      title: '',
      clientId: this.defaultClientId(),
      role: this.defaultRole(),
      tags: [],
    };
    this.formError.set(null);
    this.selectedAvatarFile = null;
    this.avatarDropzone()?.reset();
    void this.loadClients();
  }

  private async loadClients() {
    if (!this.showOrgPicker() && this.defaultClientId()) return;
    if (this.clients().length > 0) return;
    try {
      this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
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
    this.saving.set(true);
    this.formError.set(null);
    try {
      const created = await this.comms.createContact({
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim() || undefined,
        email: this.form.email.trim() || undefined,
        title: this.form.title.trim() || undefined,
        clientId: this.form.clientId ?? undefined,
        role: this.form.clientId ? this.form.role.trim() || undefined : undefined,
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
      this.created.emit(result);
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.saving.set(false);
    }
  }
}
