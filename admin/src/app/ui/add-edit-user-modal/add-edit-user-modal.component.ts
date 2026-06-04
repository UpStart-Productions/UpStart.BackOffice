import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import type { UserListDto, UserRole } from '@upstart/back-office/shared';

export type UserRow = UserListDto;

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Staff', value: 'MEMBER' },
];

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

@Component({
  selector: 'app-add-edit-user-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    ButtonModule,
    MessageModule,
    SelectModule,
  ],
  styles: `
    .avatar-upload-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .avatar-preview {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .avatar-preview img {
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      object-fit: cover;
    }
  `,
  template: `
    <p-dialog
      [header]="isEdit() ? 'Edit User' : 'Add User'"
      [(visible)]="visible"
      [modal]="true"
      [closable]="true"
      [style]="{ width: '32rem' }"
      (onHide)="onDialogHide()"
    >
      <form [formGroup]="form" (ngSubmit)="save()">
        <div class="form-field mb-3">
          <label>Avatar</label>
          <div class="avatar-upload-section">
            @if (avatarPreview() || (isEdit() && user()?.avatarUrl && !removeAvatar)) {
              <div class="avatar-preview">
                <img
                  [src]="avatarPreview() || user()?.avatarUrl"
                  alt="Avatar preview"
                />
                <button
                  type="button"
                  pButton
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  [rounded]="true"
                  (click)="clearAvatar()"
                  aria-label="Remove avatar"
                ></button>
              </div>
            }
            <input
              type="file"
              accept="image/*"
              (change)="onAvatarSelected($event)"
              id="userAvatarInput"
              style="display: none;"
            />
            <button
              type="button"
              pButton
              label="Choose Image"
              icon="pi pi-upload"
              severity="secondary"
              (click)="triggerAvatarUpload()"
            ></button>
          </div>
        </div>
        <div class="showcase-row mb-3">
          <div class="showcase-half form-field">
            <label for="user-firstName">First name</label>
            <input pInputText id="user-firstName" type="text" formControlName="firstName" class="w-full" />
          </div>
          <div class="showcase-half form-field">
            <label for="user-lastName">Last name</label>
            <input pInputText id="user-lastName" type="text" formControlName="lastName" class="w-full" />
          </div>
        </div>
        <div class="form-field mb-3">
          <label for="user-email">Email</label>
          <input pInputText id="user-email" type="email" formControlName="email" class="w-full" />
        </div>
        <div class="showcase-row mb-3">
          <div class="showcase-half form-field">
            <label for="user-role">Role</label>
            <p-select
              id="user-role"
              formControlName="role"
              [options]="roleOptions"
              optionLabel="label"
              optionValue="value"
              styleClass="w-full"
            />
          </div>
          <div class="showcase-half form-field">
            <label for="user-hourlyRate">Hourly rate (optional)</label>
            <p-inputNumber
              id="user-hourlyRate"
              formControlName="hourlyRate"
              mode="currency"
              currency="USD"
              locale="en-US"
              styleClass="w-full"
            />
          </div>
        </div>
        @if (error()) {
          <p-message severity="error" [text]="error()!" class="mb-3" />
        }
        <div class="form-actions">
          <button type="button" pButton label="Cancel" severity="secondary" (click)="cancel()"></button>
          <button
            type="submit"
            pButton
            [label]="isEdit() ? 'Save' : 'Add User'"
            [loading]="saving()"
            [disabled]="form.invalid || saving()"
          ></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class AddEditUserModalComponent {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  visible = false;
  saving = signal(false);
  error = signal<string | null>(null);
  isEdit = signal(false);
  user = signal<UserRow | null>(null);
  avatarPreview = signal<string | null>(null);
  removeAvatar = false;
  selectedAvatarFile: File | null = null;
  readonly roleOptions = ROLE_OPTIONS;

  form = new FormGroup({
    firstName: new FormControl(''),
    lastName: new FormControl(''),
    email: new FormControl('', [Validators.required, Validators.email]),
    role: new FormControl<UserRole>('MEMBER', { nonNullable: true }),
    hourlyRate: new FormControl<number | null>(null),
  });

  private resolve: ((saved: boolean) => void) | null = null;

  open(existing?: UserRow): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.user.set(existing ?? null);
      this.isEdit.set(!!existing);
      this.visible = true;
      this.error.set(null);
      this.avatarPreview.set(null);
      this.selectedAvatarFile = null;
      this.removeAvatar = false;
      this.form.reset({
        firstName: existing?.firstName ?? '',
        lastName: existing?.lastName ?? '',
        email: existing?.email ?? '',
        role: existing?.role === 'CLIENT' ? 'MEMBER' : (existing?.role ?? 'MEMBER'),
        hourlyRate: existing?.hourlyRate ?? null,
      });
      if (existing) {
        this.form.controls.email.disable();
      } else {
        this.form.controls.email.enable();
      }
    });
  }

  onDialogHide() {
    this.form.reset();
    this.error.set(null);
    this.avatarPreview.set(null);
    this.selectedAvatarFile = null;
    this.removeAvatar = false;
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
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
    this.selectedAvatarFile = file;
    this.removeAvatar = false;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.avatarPreview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  clearAvatar() {
    this.selectedAvatarFile = null;
    this.avatarPreview.set(null);
    if (this.isEdit()) {
      this.removeAvatar = true;
    }
    const input = document.getElementById('userAvatarInput') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  triggerAvatarUpload() {
    document.getElementById('userAvatarInput')?.click();
  }

  cancel() {
    this.visible = false;
    this.resolve?.(false);
    this.resolve = null;
  }

  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const payload = {
      firstName: v.firstName?.trim() || undefined,
      lastName: v.lastName?.trim() || undefined,
      role: v.role,
      hourlyRate: v.hourlyRate,
      ...(this.removeAvatar ? { avatarUrl: null as null } : {}),
    };

    try {
      const existing = this.user();
      let userId: string;

      if (existing) {
        await this.api.patch(`/users/${existing.id}`, payload);
        userId = existing.id;
        this.toast.add({ severity: 'success', summary: 'Saved', detail: 'User updated.' });
      } else {
        const created = await this.api.post<{ user: UserRow }>('/users', {
          ...payload,
          email: v.email!.trim().toLowerCase(),
        });
        userId = created.user.id;
        this.toast.add({ severity: 'success', summary: 'Added', detail: 'User added.' });
      }

      if (this.selectedAvatarFile) {
        await this.api.uploadFile<{ url: string }>(
          `/users/${userId}/avatar`,
          this.selectedAvatarFile,
        );
        if (this.session.me()?.id === userId) {
          await this.session.refresh();
        }
      }

      this.visible = false;
      this.resolve?.(true);
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
