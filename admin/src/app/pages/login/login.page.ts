import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule, PasswordModule],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  needsNewPassword = signal(false);
  newPassword = '';

  get useCognito() { return this.cognito.useCognito; }

  async signIn() {
    this.error.set(null);
    if (!this.email.trim()) { this.error.set('Email is required'); return; }

    if (!this.useCognito) {
      this.auth.baseEmail = this.email.trim();
      this.router.navigate(['/time-entry']);
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
