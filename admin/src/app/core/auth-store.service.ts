import { inject, Injectable } from '@angular/core';
import { CognitoAuthService } from './cognito-auth.service';

const KEYS = {
  baseEmail: 'ubo_base_email',
  tenantSlug: 'ubo_tenant_slug',
  impersonatedUserId: 'ubo_impersonated_user_id',
  impersonatedName: 'ubo_impersonated_name',
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

  /** Super users only (the API ignores it otherwise): act as this user. */
  get impersonatedUserId(): string { return localStorage.getItem(KEYS.impersonatedUserId) ?? ''; }
  get impersonatedName(): string { return localStorage.getItem(KEYS.impersonatedName) ?? ''; }
  startImpersonating(id: string, name: string) {
    localStorage.setItem(KEYS.impersonatedUserId, id);
    localStorage.setItem(KEYS.impersonatedName, name);
    localStorage.removeItem(KEYS.tenantSlug);
  }
  stopImpersonating() {
    localStorage.removeItem(KEYS.impersonatedUserId);
    localStorage.removeItem(KEYS.impersonatedName);
  }

  clear() {
    this.stopImpersonating();
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
    if (this.impersonatedUserId) headers['x-impersonate-user-id'] = this.impersonatedUserId;

    return { ...options, headers };
  }
}
