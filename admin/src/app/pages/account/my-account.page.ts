import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { AvatarDropzoneComponent } from '../../ui/avatar-dropzone/avatar-dropzone.component';
import { EmailNotificationPrefsComponent } from '../../ui/email-notification-prefs/email-notification-prefs.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';

@Component({
  selector: 'app-my-account-page',
  standalone: true,
  imports: [
    PageComponent,
    FormsModule,
    InputTextModule,
    ButtonModule,
    MessageModule,
    PasswordModule,
    HelpTextComponent,
    AvatarDropzoneComponent,
    EmailNotificationPrefsComponent,
  ],
  template: `
    <app-page title="My Account" helpKey="account">
      <div class="grid grid-3">
        <div class="stack span-2">
          <div class="card">
            <h3 class="showcase-section-title mb-3">Profile</h3>
            <form (ngSubmit)="saveProfile()">
              <div class="form-field mb-3">
                <label>Photo</label>
                <app-avatar-dropzone
                  #avatarDropzone
                  [existingUrl]="removeAvatar ? null : avatarPreview()"
                  (fileChange)="onAvatarFile($event)"
                  (invalidFile)="profileError.set($event)"
                />
              </div>
              <div class="showcase-row mb-3">
                <div class="showcase-half form-field">
                  <label for="account-firstName">First name</label>
                  <input pInputText id="account-firstName" type="text" [(ngModel)]="firstName" name="firstName" class="w-full" />
                </div>
                <div class="showcase-half form-field">
                  <label for="account-lastName">Last name</label>
                  <input pInputText id="account-lastName" type="text" [(ngModel)]="lastName" name="lastName" class="w-full" />
                </div>
              </div>
              <div class="form-field mb-3">
                <label for="account-email">Email <app-help-text key="account.email" /></label>
                <input pInputText id="account-email" type="email" [(ngModel)]="email" name="email" required class="w-full" />
              </div>
              @if (profileError()) {
                <p-message severity="error" [text]="profileError()!" class="mb-3" />
              }
              <div class="form-actions">
                <p-button type="submit" label="Save profile" icon="pi pi-check" [loading]="profileSaving()" [disabled]="profileSaving()" />
              </div>
            </form>
          </div>

          <div class="card">
            <h3 class="showcase-section-title mb-3">Password</h3>
            @if (!resetStep()) {
              <p class="text-color-secondary mt-0 mb-3">
                We email a one-time code to {{ email.trim() || 'your address' }}. The code expires in 15 minutes.
              </p>
              @if (passwordMessage()) {
                <p-message [severity]="passwordMessageSeverity()" [text]="passwordMessage()!" class="mb-3" />
              }
              <div class="form-actions">
                <p-button
                  label="Send reset code"
                  icon="pi pi-envelope"
                  [loading]="passwordBusy()"
                  (onClick)="sendResetCode()"
                />
              </div>
            } @else {
              <div class="form-field mb-3">
                <label for="resetCode">Verification code <app-help-text key="login.resetConfirm" /></label>
                <input pInputText id="resetCode" type="text" [(ngModel)]="resetCode" name="resetCode" class="w-full" autocomplete="one-time-code" />
              </div>
              <div class="form-field mb-3">
                <label for="newPassword">New password <app-help-text key="auth.invitePassword" /></label>
                <p-password
                  id="newPassword"
                  [(ngModel)]="newPassword"
                  name="newPassword"
                  styleClass="w-full"
                  inputStyleClass="w-full"
                  [feedback]="false"
                  toggleMask
                />
              </div>
              @if (passwordMessage()) {
                <p-message [severity]="passwordMessageSeverity()" [text]="passwordMessage()!" class="mb-3" />
              }
              <div class="form-actions">
                <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="cancelReset()" [disabled]="passwordBusy()" />
                <p-button label="Set new password" icon="pi pi-lock" [loading]="passwordBusy()" (onClick)="confirmReset()" />
              </div>
            }
          </div>
        </div>

        <div class="side-panel-stack span-1">
          <div class="card card--side">
            <div class="card-header">
              <h3 class="card-title">
                Email notifications
                <app-help-text key="account.emailNotifications" />
              </h3>
            </div>
            <p class="text-color-secondary mt-0 mb-3">In-app alerts always appear in the bell and Task Manager inbox. Choose which types also send email.</p>
            <app-email-notification-prefs />
          </div>
        </div>
      </div>
    </app-page>
  `,
})
export class MyAccountPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  private readonly avatarDropzone = viewChild<AvatarDropzoneComponent>('avatarDropzone');

  firstName = '';
  lastName = '';
  email = '';
  avatarPreview = signal<string | null>(null);
  selectedAvatarFile: File | null = null;
  removeAvatar = false;

  profileSaving = signal(false);
  profileError = signal<string | null>(null);

  resetStep = signal(false);
  resetCode = '';
  newPassword = '';
  passwordBusy = signal(false);
  passwordMessage = signal<string | null>(null);
  passwordMessageSeverity = signal<'success' | 'error' | 'info'>('info');

  ngOnInit() {
    this.loadFromSession();
  }

  private loadFromSession() {
    const me = this.session.me();
    if (!me) return;
    this.firstName = me.firstName?.trim() ?? '';
    this.lastName = me.lastName?.trim() ?? '';
    this.email = me.email?.trim() ?? '';
    this.avatarPreview.set(resolveAssetUrl(me.avatarUrl ?? null));
  }

  onAvatarFile(file: File | null) {
    this.profileError.set(null);
    this.selectedAvatarFile = file;
    if (file) {
      this.removeAvatar = false;
      return;
    }
    this.removeAvatar = true;
  }

  async saveProfile() {
    const trimmedEmail = this.email.trim().toLowerCase();
    if (!trimmedEmail) {
      this.profileError.set('Email is required.');
      return;
    }

    this.profileSaving.set(true);
    this.profileError.set(null);
    const me = this.session.me();
    try {
      await this.api.patch('/users/me', {
        firstName: this.firstName.trim() || undefined,
        lastName: this.lastName.trim() || undefined,
        email: trimmedEmail !== me?.email?.trim().toLowerCase() ? trimmedEmail : undefined,
        ...(this.removeAvatar ? { avatarUrl: null } : {}),
      });

      if (this.selectedAvatarFile) {
        await this.api.uploadAvatar<{ url: string }>('/users/me/avatar', this.selectedAvatarFile);
      }

      await this.session.refresh();
      this.loadFromSession();
      this.selectedAvatarFile = null;
      this.removeAvatar = false;
      this.avatarDropzone()?.reset();

      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail:
          trimmedEmail !== me?.email?.trim().toLowerCase()
            ? 'Profile updated. Sign in with your new email next time if it changed.'
            : 'Profile updated.',
      });
    } catch (err) {
      this.profileError.set(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      this.profileSaving.set(false);
    }
  }

  async sendResetCode() {
    const addr = this.email.trim();
    if (!addr) return;
    this.passwordBusy.set(true);
    this.passwordMessage.set(null);
    try {
      await this.api.post('/password-reset/request', { email: addr });
      this.passwordMessage.set('If that email has an account, we sent a reset code.');
      this.passwordMessageSeverity.set('success');
      this.resetStep.set(true);
      this.resetCode = '';
      this.newPassword = '';
    } catch (err) {
      this.passwordMessage.set(err instanceof Error ? err.message : 'Could not send code.');
      this.passwordMessageSeverity.set('error');
    } finally {
      this.passwordBusy.set(false);
    }
  }

  cancelReset() {
    this.resetStep.set(false);
    this.resetCode = '';
    this.newPassword = '';
    this.passwordMessage.set(null);
  }

  async confirmReset() {
    const addr = this.email.trim();
    if (!addr || !this.resetCode.trim() || !this.newPassword) return;
    this.passwordBusy.set(true);
    this.passwordMessage.set(null);
    try {
      await this.api.post('/password-reset/confirm', {
        email: addr,
        code: this.resetCode.trim(),
        password: this.newPassword,
      });
      this.passwordMessage.set('Password updated.');
      this.passwordMessageSeverity.set('success');
      this.resetStep.set(false);
      this.resetCode = '';
      this.newPassword = '';
    } catch (err) {
      this.passwordMessage.set(err instanceof Error ? err.message : 'Could not reset password.');
      this.passwordMessageSeverity.set('error');
    } finally {
      this.passwordBusy.set(false);
    }
  }
}
