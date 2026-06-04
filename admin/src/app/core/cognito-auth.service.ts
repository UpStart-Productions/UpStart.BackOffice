import { Injectable } from '@angular/core';
import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  fetchAuthSession,
  fetchUserAttributes,
  resetPassword,
  signIn,
  signOut,
} from 'aws-amplify/auth';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CognitoAuthService {
  private cachedIdToken: string | null = null;
  private initialized = false;
  private _wasOAuthCallback = false;

  get wasOAuthCallback(): boolean {
    return this._wasOAuthCallback;
  }

  constructor() {
    if (environment.useCognito && environment.cognito) {
      const c = environment.cognito;
      const redirectBase =
        typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/`
          : c.redirectSignIn;
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: c.userPoolId,
            userPoolClientId: c.userPoolClientId,
            loginWith: {
              oauth: {
                domain: c.customDomain ?? `${c.domainPrefix}.auth.${c.region}.amazoncognito.com`,
                scopes: ['openid', 'profile', 'email'],
                redirectSignIn: [redirectBase],
                redirectSignOut: [redirectBase],
                responseType: 'code',
              },
            },
          },
        },
      });
    }
  }

  get useCognito(): boolean {
    return environment.useCognito && !!environment.cognito;
  }

  async init(): Promise<void> {
    if (!this.useCognito || this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      this.normalizeOAuthCallbackUrl();
    }

    if (this.isOAuthCallbackUrl()) {
      this._wasOAuthCallback = true;
      await new Promise((r) => setTimeout(r, 50));
      await this.waitForOAuthCompletion();
    }

    try {
      const session = await fetchAuthSession();
      this.cachedIdToken = session.tokens?.idToken?.toString() ?? null;
    } catch {
      this.cachedIdToken = null;
    }
  }

  private isOAuthCallbackUrl(): boolean {
    if (typeof window === 'undefined') return false;
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    return (
      (search.includes('code=') || hash.includes('code=')) &&
      (search.includes('state=') || hash.includes('state='))
    );
  }

  private normalizeOAuthCallbackUrl(): void {
    const hash = window.location.hash || '';
    if (!hash || !hash.includes('code=')) return;
    const hashPart = hash.indexOf('?') >= 0 ? hash.substring(hash.indexOf('?')) : hash;
    const params = new URLSearchParams(hashPart.startsWith('?') ? hashPart.slice(1) : hashPart);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state) {
      window.location.replace(
        `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      );
    }
  }

  private async waitForOAuthCompletion(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) return;
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async signInWithPassword(
    username: string,
    password: string,
  ): Promise<{ needsNewPassword: boolean }> {
    if (!this.useCognito) return { needsNewPassword: false };
    const result = await signIn({ username: username.trim(), password });
    const step = (result as { nextStep?: { signInStep?: string } }).nextStep?.signInStep;
    const needsNewPassword =
      step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' ||
      step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD';
    if (needsNewPassword) {
      this.cachedIdToken = null;
      return { needsNewPassword: true };
    }
    const session = await fetchAuthSession();
    this.cachedIdToken = session.tokens?.idToken?.toString() ?? null;
    return { needsNewPassword: false };
  }

  async confirmSignInWithNewPassword(newPassword: string): Promise<void> {
    if (!this.useCognito) return;
    await confirmSignIn({ challengeResponse: newPassword });
    const session = await fetchAuthSession();
    this.cachedIdToken = session.tokens?.idToken?.toString() ?? null;
  }

  async getEmailFromSession(): Promise<string | null> {
    if (!this.useCognito) return null;
    try {
      const attrs = await fetchUserAttributes();
      return attrs.email ?? attrs.preferred_username ?? null;
    } catch {
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        if (idToken) {
          const payload = this.decodeJwtPayload(idToken);
          const raw = payload?.['email'] ?? payload?.['preferred_username'] ?? null;
          return typeof raw === 'string' ? raw : null;
        }
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join(''),
      );
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async requestPasswordReset(username: string): Promise<{ deliveryMedium: string }> {
    if (!this.useCognito) throw new Error('Cognito not configured');
    const result = await resetPassword({ username: username.trim() });
    return {
      deliveryMedium: result.nextStep?.codeDeliveryDetails?.deliveryMedium ?? 'EMAIL',
    };
  }

  async confirmPasswordReset(
    username: string,
    confirmationCode: string,
    newPassword: string,
  ): Promise<void> {
    if (!this.useCognito) return;
    await confirmResetPassword({
      username: username.trim(),
      confirmationCode: confirmationCode.trim(),
      newPassword,
    });
  }

  /** Clear Cognito session locally without an OAuth redirect (sign-out from the app). */
  async clearLocalSession(): Promise<void> {
    if (!this.useCognito) return;
    this.cachedIdToken = null;
    try {
      await signOut({ global: true });
    } catch {
      /* ignore */
    }
  }

  async signOut(): Promise<void> {
    if (!this.useCognito) return;
    this.cachedIdToken = null;
    const redirectUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? `${window.location.origin}/`
        : environment.cognito!.redirectSignOut;
    await signOut({ global: true, oauth: { redirectUrl } });
  }

  async refreshSession(): Promise<string | null> {
    if (!this.useCognito) return null;
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      this.cachedIdToken = session.tokens?.idToken?.toString() ?? null;
    } catch {
      this.cachedIdToken = null;
    }
    return this.cachedIdToken;
  }

  async getIdToken(): Promise<string | null> {
    if (!this.useCognito) return null;
    try {
      const session = await fetchAuthSession();
      this.cachedIdToken = session.tokens?.idToken?.toString() ?? null;
      if (!this.cachedIdToken) {
        return this.refreshSession();
      }
    } catch {
      return this.refreshSession();
    }
    return this.cachedIdToken;
  }

  hasCachedToken(): boolean {
    return this.cachedIdToken !== null;
  }

  clearCache(): void {
    this.cachedIdToken = null;
  }
}
