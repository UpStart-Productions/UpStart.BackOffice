import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { SessionService } from '../../core/session.service';

type InviteInfo = {
  status: 'valid' | 'expired' | 'accepted';
  email: string;
  firstName: string | null;
  lastName: string | null;
  inviterName: string | null;
  projectName: string | null;
  usesPassword: boolean;
};

/** Public landing page for an emailed Task Manager invite: set name + password, then sign in. */
@Component({
  selector: 'app-accept-invite-page',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, PasswordModule],
  styleUrl: '../login/login.page.scss',
  template: `
    <div class="login-page">
      <div class="login-card card">
        <div class="login-header">
          <img src="/images/upstart-logo-dark.svg" alt="UpStart" class="login-logo" width="200" height="62" />
          <p>Tasks</p>
        </div>

        @if (loading()) {
          <p class="text-center text-color-secondary"><i class="pi pi-spin pi-spinner"></i></p>
        } @else if (loadError()) {
          <p-message severity="error" styleClass="w-full mb-3" [text]="loadError()!" />
          <a routerLink="/login" class="link-button">Go to sign in</a>
        } @else if (info(); as i) {
          @if (i.status === 'accepted') {
            <p-message severity="info" styleClass="w-full mb-3" text="This invitation was already accepted. Sign in with your email and password." />
            <a routerLink="/login" class="link-button">Go to sign in</a>
          } @else if (i.status === 'expired') {
            <p-message severity="warn" styleClass="w-full mb-3" text="This invitation has expired. Ask the person who shared it to send a new one." />
          } @else {
            <h2 class="page-title mb-2">You're invited</h2>
            <p class="text-color-secondary mb-3">
              {{ i.inviterName || 'Someone' }} shared
              <strong>{{ i.projectName || 'a project' }}</strong> with you.
              {{ i.usesPassword ? 'Set a password to get started.' : '' }}
            </p>
            <form class="login-form" (ngSubmit)="accept()">
              <div class="form-field mb-3">
                <label for="invite-email">Email</label>
                <input pInputText id="invite-email" name="email" [value]="i.email" class="w-full" disabled />
              </div>
              <div class="flex gap-2 mb-3">
                <div class="form-field flex-1">
                  <label for="invite-first">First name</label>
                  <input pInputText id="invite-first" name="firstName" [(ngModel)]="firstName" class="w-full" autocomplete="given-name" />
                </div>
                <div class="form-field flex-1">
                  <label for="invite-last">Last name</label>
                  <input pInputText id="invite-last" name="lastName" [(ngModel)]="lastName" class="w-full" autocomplete="family-name" />
                </div>
              </div>
              @if (i.usesPassword) {
                <div class="form-field mb-3">
                  <label for="invite-password">Password</label>
                  <p-password
                    inputId="invite-password"
                    name="password"
                    [(ngModel)]="password"
                    [toggleMask]="true"
                    [feedback]="false"
                    styleClass="w-full"
                    inputStyleClass="w-full"
                    autocomplete="new-password"
                  />
                  <small class="text-color-secondary">At least 8 characters, with upper and lower case letters, a number and a symbol.</small>
                </div>
                <div class="form-field mb-3">
                  <label for="invite-confirm">Confirm password</label>
                  <p-password
                    inputId="invite-confirm"
                    name="confirm"
                    [(ngModel)]="confirm"
                    [toggleMask]="true"
                    [feedback]="false"
                    styleClass="w-full"
                    inputStyleClass="w-full"
                    autocomplete="new-password"
                  />
                </div>
              }
              @if (error()) {
                <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" />
              }
              <div class="login-actions">
                <button type="submit" pButton label="Accept and open Tasks" [loading]="saving()" [disabled]="saving()"></button>
              </div>
            </form>
          }
        }
      </div>
    </div>
  `,
})
export class AcceptInvitePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly session = inject(SessionService);

  private token = '';
  info = signal<InviteInfo | null>(null);
  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);
  error = signal<string | null>(null);
  firstName = '';
  lastName = '';
  password = '';
  confirm = '';

  async ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.loadError.set('This invitation link is incomplete. Open the link from your email again.');
      this.loading.set(false);
      return;
    }
    try {
      const info = await this.api.get<InviteInfo>(`/invites/${encodeURIComponent(this.token)}`);
      this.info.set(info);
      this.firstName = info.firstName ?? '';
      this.lastName = info.lastName ?? '';
    } catch (err) {
      this.loadError.set(this.clean(err));
    } finally {
      this.loading.set(false);
    }
  }

  private clean(err: unknown): string {
    return (err instanceof Error ? err.message : String(err)).replace(/^API error \d+: /, '');
  }

  async accept() {
    const info = this.info();
    if (!info) return;
    this.error.set(null);
    if (info.usesPassword) {
      if (this.password.length < 8) return this.error.set('Password must be at least 8 characters.');
      if (this.password !== this.confirm) return this.error.set("Passwords don't match.");
    }
    this.saving.set(true);
    try {
      const res = await this.api.post<{ email: string; projectId: string | null }>(
        `/invites/${encodeURIComponent(this.token)}/accept`,
        { firstName: this.firstName.trim(), lastName: this.lastName.trim(), ...(info.usesPassword ? { password: this.password } : {}) },
      );
      if (this.cognito.useCognito) {
        await this.cognito.signOutThisDevice();
        await this.cognito.signInWithPassword(res.email, this.password);
        await this.cognito.getIdToken();
      }
      this.auth.baseEmail = res.email;
      this.session.reset();
      await this.session.getReady();
      await this.router.navigate(res.projectId ? ['/tasks/projects', res.projectId] : ['/tasks']);
    } catch (err) {
      this.error.set(this.clean(err));
    } finally {
      this.saving.set(false);
    }
  }
}
