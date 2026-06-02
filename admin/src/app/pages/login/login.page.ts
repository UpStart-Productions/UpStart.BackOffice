import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { WorkspaceService } from '../../core/workspace.service';

const DEV_LOGIN_EMAIL = 'admin@upstart.test';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule, PasswordModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthStoreService);
  private readonly api = inject(ApiService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);

  email = DEV_LOGIN_EMAIL;
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  needsNewPassword = signal(false);
  newPassword = '';

  get useCognito() { return this.cognito.useCognito; }

  ngOnInit() {
    if (!this.useCognito && !this.email.trim()) {
      this.email = DEV_LOGIN_EMAIL;
    }
    const authError = sessionStorage.getItem('ubo_auth_error');
    if (authError) {
      this.error.set(authError);
      sessionStorage.removeItem('ubo_auth_error');
    }
  }

  async signIn() {
    this.error.set(null);
    if (!this.email.trim()) { this.error.set('Email is required'); return; }

    if (!this.useCognito) {
      this.auth.baseEmail = this.email.trim();
      this.workspace.reset();
      this.loading.set(true);
      try {
        await this.api.get('/users/me');
        await this.router.navigate(['/time-entry']);
      } catch (err) {
        this.auth.clear();
        this.error.set(
          err instanceof Error
            ? err.message
            : 'Sign in failed. Run npm run dev:seed and use admin@upstart.test.',
        );
      } finally {
        this.loading.set(false);
      }
      return;
    }

    this.loading.set(true);
    try {
      const result = await this.cognito.signInWithPassword(this.email, this.password);
      if (result.needsNewPassword) { this.needsNewPassword.set(true); return; }
      const sessionEmail = await this.cognito.getEmailFromSession();
      if (sessionEmail) this.auth.baseEmail = sessionEmail;
      this.router.navigate(['/time-entry']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      this.loading.set(false);
    }
  }

  async confirmNewPassword() {
    if (!this.newPassword.trim()) return;
    this.loading.set(true);
    try {
      await this.cognito.confirmSignInWithNewPassword(this.newPassword);
      const email = await this.cognito.getEmailFromSession();
      if (email) this.auth.baseEmail = email;
      this.router.navigate(['/time-entry']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      this.loading.set(false);
    }
  }
}
