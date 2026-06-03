import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { SessionService } from '../../core/session.service';

const DEV_LOGIN_EMAIL = 'admin@upstart.test';

type CognitoFormMode = 'login' | 'forgot-request' | 'forgot-confirm' | 'new-password-required';

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
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  email = DEV_LOGIN_EMAIL;
  password = '';
  resetCode = '';
  newPassword = '';
  newPasswordConfirm = '';
  loading = false;
  cognitoMode: CognitoFormMode = 'login';
  loginError = '';
  forgotError = '';
  forgotSuccess = '';
  resetError = '';
  newPasswordError = '';

  get useCognito() {
    return this.cognito.useCognito;
  }

  ngOnInit() {
    this.api.resetSigningOut();
    if (!this.useCognito && !this.email.trim()) {
      this.email = DEV_LOGIN_EMAIL;
    }
    const authError = sessionStorage.getItem('ubo_auth_error');
    if (authError) {
      this.loginError = authError;
      sessionStorage.removeItem('ubo_auth_error');
    }
    if (this.useCognito && this.cognito.hasCachedToken()) {
      void this.router.navigate(['/time-entry']);
    }
  }

  async signInWithEmailPassword() {
    this.loginError = '';
    if (!this.email.trim()) {
      this.loginError = 'Email is required';
      return;
    }

    if (!this.useCognito) {
      this.auth.baseEmail = this.email.trim();
      this.session.reset();
      this.loading = true;
      try {
        await this.api.get('/users/me');
        await this.router.navigate(['/time-entry']);
      } catch (err) {
        this.auth.clear();
        this.loginError =
          err instanceof Error
            ? err.message
            : 'Sign in failed. Run npm run dev:seed and use admin@upstart.test.';
      } finally {
        this.loading = false;
        this.cdr.detectChanges();
      }
      return;
    }

    this.loading = true;
    try {
      const { needsNewPassword } = await this.cognito.signInWithPassword(
        this.email,
        this.password,
      );
      if (needsNewPassword) {
        this.cognitoMode = 'new-password-required';
        this.newPassword = '';
        this.newPasswordConfirm = '';
        this.newPasswordError = '';
        this.password = '';
      } else {
        await this.completeCognitoLogin();
      }
    } catch (err) {
      this.loginError = this.getAuthErrorMessage(err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async submitNewPassword() {
    this.newPasswordError = '';
    const p = this.newPassword.trim();
    const c = this.newPasswordConfirm.trim();
    if (p.length < 8) {
      this.newPasswordError = 'Password must be at least 8 characters.';
      this.cdr.detectChanges();
      return;
    }
    if (p !== c) {
      this.newPasswordError = 'Passwords do not match.';
      this.cdr.detectChanges();
      return;
    }
    this.loading = true;
    try {
      await this.cognito.confirmSignInWithNewPassword(p);
      await this.completeCognitoLogin();
    } catch (err) {
      this.newPasswordError = this.getAuthErrorMessage(err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  showForgotRequest() {
    this.cognitoMode = 'forgot-request';
    this.forgotError = '';
    this.forgotSuccess = '';
    this.cdr.detectChanges();
  }

  backToLogin() {
    this.cognitoMode = 'login';
    this.loginError = '';
    this.forgotError = '';
    this.forgotSuccess = '';
    this.resetError = '';
    this.newPasswordError = '';
    this.newPassword = '';
    this.newPasswordConfirm = '';
    this.cdr.detectChanges();
  }

  async requestResetCode() {
    this.forgotError = '';
    this.forgotSuccess = '';
    this.loading = true;
    try {
      await this.cognito.requestPasswordReset(this.email);
      this.forgotSuccess = 'Check your email for the reset code.';
      this.cognitoMode = 'forgot-confirm';
      this.resetCode = '';
      this.newPassword = '';
    } catch (err) {
      this.forgotError = this.getAuthErrorMessage(err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async confirmResetPassword() {
    this.resetError = '';
    this.loading = true;
    try {
      await this.cognito.confirmPasswordReset(this.email, this.resetCode, this.newPassword);
      this.forgotSuccess = 'Password reset. You can now sign in.';
      this.cognitoMode = 'login';
      this.password = '';
      this.resetCode = '';
      this.newPassword = '';
    } catch (err) {
      this.resetError = this.getAuthErrorMessage(err);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private async completeCognitoLogin() {
    await this.cognito.getIdToken();
    const email = await this.cognito.getEmailFromSession();
    if (email) this.auth.baseEmail = email;
    this.session.reset();
    await this.session.getReady();
    await this.router.navigate(['/time-entry']);
  }

  private getAuthErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message.startsWith('API error ')) {
      return err.message.replace(/^API error \d+: /, '');
    }
    if (err && typeof err === 'object' && 'name' in err) {
      const name = (err as { name: string }).name;
      const message = (err as { message?: string }).message ?? '';
      if (name === 'NotAuthorizedException' || message.includes('Incorrect username or password')) {
        return 'Invalid email or password.';
      }
      if (name === 'UserNotFoundException') {
        return 'No sign-in account for this email. Ask an admin to create your account first.';
      }
      if (name === 'LimitExceededException' || message.includes('Attempt limit exceeded')) {
        return 'Too many attempts. Please try again later.';
      }
      if (
        name === 'InvalidParameterException' ||
        message.includes('cannot be reset in the current state')
      ) {
        return 'Your account needs a temporary password first. Sign in with the password from your invite, then set a new password.';
      }
      if (name === 'UserNotConfirmedException') {
        return 'Please verify your email before signing in.';
      }
      if (name === 'CodeMismatchException' || message.includes('confirmation code')) {
        return 'Invalid or expired code. Please try again.';
      }
      if (name === 'InvalidPasswordException') {
        return 'Password does not meet requirements.';
      }
      if (message) return message;
    }
    return 'An error occurred. Please try again.';
  }
}
