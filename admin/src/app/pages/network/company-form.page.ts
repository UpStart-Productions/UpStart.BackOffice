import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PopoverModule } from 'primeng/popover';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import { resolveAssetUrl } from '../../core/asset-url.util';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const FOCUS_CATEGORIES = [
  { label: 'Recovery', value: 'RECOVERY' },
  { label: 'Family', value: 'FAMILY' },
  { label: 'Youth', value: 'YOUTH' },
  { label: 'Faith', value: 'FAITH' },
  { label: 'Health', value: 'HEALTH' },
  { label: 'Disability', value: 'DISABILITY' },
  { label: 'Education', value: 'EDUCATION' },
  { label: 'Jobs / Workforce', value: 'JOBS_WORKFORCE' },
  { label: 'Pets', value: 'PETS' },
  { label: 'Funding', value: 'FUNDING' },
  { label: 'Hunger', value: 'HUNGER' },
  { label: 'Violence', value: 'VIOLENCE' },
  { label: 'Activities', value: 'ACTIVITIES' },
  { label: 'Other', value: 'OTHER' },
];

type NetworkContact = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedInUrl?: string | null;
  avatarUrl?: string | null;
  isPrimary: boolean;
};

type NetworkCompany = {
  id: string;
  name: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  services: string[];
  products: string[];
  focusCategories: string[];
  isActive: boolean;
  isReferralReady: boolean;
  isPublicFeatured: boolean;
  publicSortOrder: number;
  contacts: NetworkContact[];
};

type CompanyForm = {
  name: string;
  website: string;
  email: string;
  phone: string;
  description: string;
  servicesText: string;
  productsText: string;
  isActive: boolean;
  isReferralReady: boolean;
  isPublicFeatured: boolean;
  publicSortOrder: number;
};

type ContactRow = {
  key: string;
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedInUrl: string;
  isPrimary: boolean;
  avatarUrl: string | null;
  avatarPreview: string | null;
  pendingAvatarFile: File | null;
  removeAvatar: boolean;
};

@Component({
  selector: 'app-network-company-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    ToggleSwitchModule,
    PopoverModule,
    PageComponent,
    ArtifactsPanelComponent,
  ],
  templateUrl: './company-form.page.html',
  styleUrl: './company-form.page.scss',
})
export class NetworkCompanyFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  readonly focusCategories = FOCUS_CATEGORIES;

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  contactRows = signal<ContactRow[]>([]);
  removedContactIds = signal<string[]>([]);
  focusCategoriesSelected = signal<string[]>([]);

  form: CompanyForm = this.emptyCompanyForm();

  get isNew() {
    return !this.id();
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        await this.loadCompany(id);
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load company');
      }
    }
    this.loading.set(false);
  }

  private emptyCompanyForm(): CompanyForm {
    return {
      name: '',
      website: '',
      email: '',
      phone: '',
      description: '',
      servicesText: '',
      productsText: '',
      isActive: true,
      isReferralReady: false,
      isPublicFeatured: false,
      publicSortOrder: 0,
    };
  }

  private str(v: string | null | undefined): string {
    return v ?? '';
  }

  private linesToArray(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private arrayToLines(values: string[]): string {
    return values.join('\n');
  }

  private patchForm(company: NetworkCompany) {
    this.form = {
      name: company.name,
      website: this.str(company.website),
      email: this.str(company.email),
      phone: this.str(company.phone),
      description: this.str(company.description),
      servicesText: this.arrayToLines(company.services),
      productsText: this.arrayToLines(company.products),
      isActive: company.isActive,
      isReferralReady: company.isReferralReady,
      isPublicFeatured: company.isPublicFeatured,
      publicSortOrder: company.publicSortOrder,
    };
    this.focusCategoriesSelected.set(company.focusCategories ?? []);
    this.contactRows.set(this.mapContactsToRows(company.contacts ?? []));
    this.removedContactIds.set([]);
  }

  private mapContactsToRows(contacts: NetworkContact[]): ContactRow[] {
    return contacts.map((contact) => ({
      key: contact.id,
      id: contact.id,
      firstName: contact.firstName,
      lastName: this.str(contact.lastName),
      email: this.str(contact.email),
      phone: this.str(contact.phone),
      linkedInUrl: this.str(contact.linkedInUrl),
      isPrimary: contact.isPrimary,
      avatarUrl: contact.avatarUrl ?? null,
      avatarPreview: null,
      pendingAvatarFile: null,
      removeAvatar: false,
    }));
  }

  private async loadCompany(id: string) {
    const company = await this.api.get<NetworkCompany>(`/network/companies/${id}`);
    this.patchForm(company);
  }

  toggleFocusCategory(value: string) {
    this.focusCategoriesSelected.update((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  contactDisplayName(contact: Pick<ContactRow, 'firstName' | 'lastName'>): string {
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  }

  contactInitials(contact: Pick<ContactRow, 'firstName' | 'lastName'>): string {
    const first = contact.firstName.trim().charAt(0);
    const last = contact.lastName.trim().charAt(0);
    return (first + last).toUpperCase() || '?';
  }

  contactAvatarSrc(contact: ContactRow): string | null {
    if (contact.avatarPreview) return contact.avatarPreview;
    if (contact.removeAvatar) return null;
    return resolveAssetUrl(contact.avatarUrl);
  }

  contactAvatarInputId(contact: ContactRow): string {
    return `contactAvatarInput-${contact.key}`;
  }

  triggerContactAvatarUpload(contact: ContactRow) {
    document.getElementById(this.contactAvatarInputId(contact))?.click();
  }

  async onContactAvatarSelected(contact: ContactRow, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!AVATAR_MIMES.includes(file.type)) {
      this.error.set('Invalid file type. Use PNG, JPEG, GIF, or WebP.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.error.set('Image must be less than 5MB.');
      return;
    }

    this.error.set(null);

    if (contact.id) {
      try {
        const result = await this.api.uploadAvatar<{ url: string }>(
          `/network/contacts/${contact.id}/avatar`,
          file,
        );
        this.updateContactRow(contact.key, {
          avatarUrl: result.url,
          avatarPreview: null,
          pendingAvatarFile: null,
          removeAvatar: false,
        });
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Avatar upload failed');
      }
      return;
    }

    const preview = await this.readFileAsDataUrl(file);
    this.updateContactRow(contact.key, {
      avatarPreview: preview,
      pendingAvatarFile: file,
      removeAvatar: false,
    });
  }

  async clearContactAvatar(contact: ContactRow) {
    if (contact.id && (contact.avatarUrl || contact.avatarPreview) && !contact.removeAvatar) {
      try {
        await this.api.delete(`/network/contacts/${contact.id}/avatar`);
        this.updateContactRow(contact.key, {
          avatarUrl: null,
          avatarPreview: null,
          pendingAvatarFile: null,
          removeAvatar: false,
        });
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to remove avatar');
      }
      return;
    }

    this.updateContactRow(contact.key, {
      avatarPreview: null,
      pendingAvatarFile: null,
      removeAvatar: contact.id ? true : false,
    });
  }

  private updateContactRow(key: string, patch: Partial<ContactRow>) {
    this.contactRows.update((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  addContactRow() {
    this.contactRows.update((rows) => [
      ...rows,
      {
        key: `new-${crypto.randomUUID()}`,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        linkedInUrl: '',
        isPrimary: rows.length === 0,
        avatarUrl: null,
        avatarPreview: null,
        pendingAvatarFile: null,
        removeAvatar: false,
      },
    ]);
  }

  onPrimaryChange(key: string, isPrimary: boolean) {
    if (isPrimary) {
      this.contactRows.update((rows) =>
        rows.map((row) => ({ ...row, isPrimary: row.key === key })),
      );
      return;
    }
    this.contactRows.update((rows) =>
      rows.map((row) => (row.key === key ? { ...row, isPrimary: false } : row)),
    );
  }

  confirmRemoveContact(row: ContactRow) {
    const label = this.contactDisplayName(row) || 'this contact';
    this.confirm.confirm({
      message: `Remove contact "${label}"?`,
      accept: () => {
        if (row.id) {
          this.removedContactIds.update((ids) => [...ids, row.id!]);
        }
        this.contactRows.update((rows) => {
          const next = rows.filter((r) => r.key !== row.key);
          if (row.isPrimary && next.length > 0 && !next.some((r) => r.isPrimary)) {
            next[0] = { ...next[0], isPrimary: true };
          }
          return next;
        });
      },
    });
  }

  private buildCompanyPayload() {
    const emptyToUndefined = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      name: this.form.name.trim(),
      website: emptyToUndefined(this.form.website),
      email: emptyToUndefined(this.form.email),
      phone: emptyToUndefined(this.form.phone),
      description: emptyToUndefined(this.form.description),
      services: this.linesToArray(this.form.servicesText),
      products: this.linesToArray(this.form.productsText),
      focusCategories: this.focusCategoriesSelected(),
      isActive: this.form.isActive,
      isReferralReady: this.form.isReferralReady,
      isPublicFeatured: this.form.isPublicFeatured,
      publicSortOrder: this.form.publicSortOrder,
    };
  }

  private buildContactPayload(row: ContactRow) {
    const emptyToUndefined = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      firstName: row.firstName.trim(),
      lastName: emptyToUndefined(row.lastName),
      email: emptyToUndefined(row.email),
      phone: emptyToUndefined(row.phone),
      linkedInUrl: emptyToUndefined(row.linkedInUrl),
      isPrimary: row.isPrimary,
    };
  }

  private async syncContacts(companyId: string) {
    for (const contactId of this.removedContactIds()) {
      await this.api.delete(`/network/contacts/${contactId}`);
    }

    for (const row of this.contactRows()) {
      if (!row.firstName.trim()) continue;
      const payload = this.buildContactPayload(row);

      if (row.id) {
        await this.api.put(`/network/contacts/${row.id}`, payload);
        if (row.removeAvatar) {
          await this.api.delete(`/network/contacts/${row.id}/avatar`);
        } else if (row.pendingAvatarFile) {
          await this.api.uploadAvatar(
            `/network/contacts/${row.id}/avatar`,
            row.pendingAvatarFile,
          );
        }
      } else {
        const created = await this.api.post<NetworkContact>('/network/contacts', {
          ...payload,
          companyId,
        });
        if (row.pendingAvatarFile) {
          await this.api.uploadAvatar(
            `/network/contacts/${created.id}/avatar`,
            row.pendingAvatarFile,
          );
        }
      }
    }

    this.removedContactIds.set([]);
  }

  async save() {
    if (!this.form.name.trim()) {
      this.error.set('Company name is required');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const payload = this.buildCompanyPayload();
      if (this.isNew) {
        const created = await this.api.post<NetworkCompany>('/network/companies', payload);
        await this.syncContacts(created.id);
        this.id.set(created.id);
        await this.loadCompany(created.id);
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Company created successfully.',
        });
        await this.router.navigate(['/network', created.id], { replaceUrl: true });
      } else {
        await this.api.put(`/network/companies/${this.id()}`, payload);
        await this.syncContacts(this.id()!);
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Company saved successfully.',
        });
        await this.loadCompany(this.id()!);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
