import { Component, inject, signal, viewChild } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { MoneyInputComponent } from '../money-input/money-input.component';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import type { UserListDto } from '@upstart/back-office/shared';

export type UserRow = UserListDto;

const ADMIN_CHOICE = 'ADMIN';

type RoleOption = { label: string; value: string };

import { inviteToast } from '../../pages/users/invite-toast';
import { HelpTextComponent } from '../help-text/help-text.component';
import { AvatarDropzoneComponent } from '../avatar-dropzone/avatar-dropzone.component';

@Component({
  selector: 'app-add-edit-user-modal',
  standalone: true,
  imports: [HelpTextComponent, 
    ReactiveFormsModule,
    AppDialogModule,
    InputTextModule,
    MoneyInputComponent,
    ButtonModule,
    MessageModule,
    SelectModule,
    AvatarDropzoneComponent,
  ],
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
          <app-avatar-dropzone
            #avatarDropzone
            [existingUrl]="removeAvatar ? null : user()?.avatarUrl"
            (fileChange)="onAvatarFile($event)"
            (invalidFile)="error.set($event)"
          />
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
              formControlName="roleChoice"
              [options]="roleOptions()"
              placeholder="Choose a role"
              optionLabel="label"
              optionValue="value"
              styleClass="w-full"
            />
          </div>
          <div class="showcase-half form-field">
            <label for="user-hourlyRate">Hourly rate (optional) <app-help-text key="user.hourlyRate" /></label>
            <app-money-input
              inputId="user-hourlyRate"
              formControlName="hourlyRate"
              [min]="0"
              styleClass="w-full"
              inputStyleClass="w-full"
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
  removeAvatar = false;
  selectedAvatarFile: File | null = null;

  private readonly avatarDropzone = viewChild<AvatarDropzoneComponent>('avatarDropzone');
  /** Admin, plus the tenant's own roles. Loaded each time the dialog opens. */
  roleOptions = signal<RoleOption[]>([{ label: 'Admin', value: ADMIN_CHOICE }]);

  form = new FormGroup({
    firstName: new FormControl(''),
    lastName: new FormControl(''),
    email: new FormControl('', [Validators.required, Validators.email]),
    roleChoice: new FormControl<string | null>(null, [Validators.required]),
    hourlyRate: new FormControl<number | null>(null),
  });

  private resolve: ((saved: boolean) => void) | null = null;

  private async loadRoleOptions() {
    try {
      const roles = await this.api.get<{ id: string; name: string }[]>('/roles');
      this.roleOptions.set([{ label: 'Admin', value: ADMIN_CHOICE }, ...roles.map((r) => ({ label: r.name, value: r.id }))]);
    } catch {
      this.roleOptions.set([{ label: 'Admin', value: ADMIN_CHOICE }]);
    }
  }

  open(existing?: UserRow): Promise<boolean> {
    void this.loadRoleOptions();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.user.set(existing ?? null);
      this.isEdit.set(!!existing);
      this.visible = true;
      this.error.set(null);
      this.selectedAvatarFile = null;
      this.removeAvatar = false;
      this.avatarDropzone()?.reset();
      this.form.reset({
        firstName: existing?.firstName ?? '',
        lastName: existing?.lastName ?? '',
        email: existing?.email ?? '',
        roleChoice: existing ? (existing.role === 'ADMIN' ? ADMIN_CHOICE : (existing.roleId ?? null)) : null,
        hourlyRate: existing?.hourlyRate ?? null,
      });
      if (existing && existing.id === this.session.me()?.id) {
        this.form.controls.email.disable(); // sign-in matches on email; changing your own would lock you out
      } else if (existing) {
        this.form.controls.email.enable();
      } else {
        this.form.controls.email.enable();
      }
    });
  }

  onDialogHide() {
    this.form.reset();
    this.error.set(null);
    this.selectedAvatarFile = null;
    this.removeAvatar = false;
    this.avatarDropzone()?.reset();
  }

  onAvatarFile(file: File | null) {
    this.error.set(null);
    this.selectedAvatarFile = file;
    if (file) {
      this.removeAvatar = false;
      return;
    }
    if (this.isEdit()) this.removeAvatar = true;
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
      role: v.roleChoice === ADMIN_CHOICE ? ('ADMIN' as const) : ('USER' as const),
      roleId: v.roleChoice === ADMIN_CHOICE ? null : v.roleChoice,
      hourlyRate: v.hourlyRate,
      ...(this.removeAvatar ? { avatarUrl: null as null } : {}),
    };

    try {
      const existing = this.user();
      let userId: string;

      if (existing) {
        const newEmail = v.email?.trim().toLowerCase();
        const emailChanged = !!newEmail && newEmail !== existing.email;
        await this.api.patch(`/users/${existing.id}`, { ...payload, ...(emailChanged ? { email: newEmail } : {}) });
        userId = existing.id;
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: emailChanged ? 'Email updated. Use "Send sign-in invite" so they can sign in with the new address.' : 'User updated.',
        });
      } else {
        const created = await this.api.post<{ user: UserRow; invite: { emailed: boolean; link?: string } }>('/users', {
          ...payload,
          email: v.email!.trim().toLowerCase(),
        });
        userId = created.user.id;
        this.toast.add(inviteToast(created.user.email, created.invite));
      }

      if (this.selectedAvatarFile) {
        await this.api.uploadAvatar<{ url: string }>(
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
