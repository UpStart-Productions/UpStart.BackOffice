import { inject, Injectable } from '@angular/core';
import { CognitoAuthService } from './cognito-auth.service';

const KEYS = {
  baseEmail: 'ubo_base_email',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthStoreService {
  private readonly cognito = inject(CognitoAuthService);

  get baseEmail(): string { return localStorage.getItem(KEYS.baseEmail) ?? ''; }
  set baseEmail(v: string) {
    if (v?.trim()) localStorage.setItem(KEYS.baseEmail, v.trim());
    else localStorage.removeItem(KEYS.baseEmail);
  }

  clear() {
    localStorage.removeItem(KEYS.baseEmail);
  }

  async getHeaders(options?: RequestInit): Promise<RequestInit> {
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> ?? {}),
    };

    if (this.cognito.useCognito) {
      const token = await this.cognito.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['x-user-email'] = this.baseEmail.trim() || 'admin@upstart.test';
    }

    return { ...options, headers };
  }
}
