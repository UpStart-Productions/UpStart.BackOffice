import { inject, Injectable } from '@angular/core';
import { CognitoAuthService } from './cognito-auth.service';

const KEYS = {
  baseEmail: 'ubo_base_email',
  tenantSlug: 'ubo_tenant_slug',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthStoreService {
  private readonly cognito = inject(CognitoAuthService);

  get baseEmail(): string { return localStorage.getItem(KEYS.baseEmail) ?? ''; }
  set baseEmail(v: string) {
    if (v?.trim()) localStorage.setItem(KEYS.baseEmail, v.trim());
    else localStorage.removeItem(KEYS.baseEmail);
  }

  /** Tenant a super user is working in. Sent as x-tenant-slug; ignored by the API for regular users. */
  get tenantSlug(): string { return localStorage.getItem(KEYS.tenantSlug) ?? ''; }
  set tenantSlug(v: string) {
    if (v?.trim()) localStorage.setItem(KEYS.tenantSlug, v.trim());
    else localStorage.removeItem(KEYS.tenantSlug);
  }

  clear() {
    localStorage.removeItem(KEYS.baseEmail);
    localStorage.removeItem(KEYS.tenantSlug);
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

    if (this.tenantSlug) headers['x-tenant-slug'] = this.tenantSlug;

    return { ...options, headers };
  }
}
