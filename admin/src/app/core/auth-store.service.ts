import { inject, Injectable } from '@angular/core';
import { CognitoAuthService } from './cognito-auth.service';

const KEYS = {
  baseEmail: 'ubo_base_email',
  workspaceSlug: 'ubo_workspace_slug',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthStoreService {
  private readonly cognito = inject(CognitoAuthService);

  get baseEmail(): string { return localStorage.getItem(KEYS.baseEmail) ?? ''; }
  set baseEmail(v: string) {
    if (v?.trim()) localStorage.setItem(KEYS.baseEmail, v.trim());
    else localStorage.removeItem(KEYS.baseEmail);
  }

  get workspaceSlug(): string { return localStorage.getItem(KEYS.workspaceSlug) ?? ''; }
  set workspaceSlug(v: string) { localStorage.setItem(KEYS.workspaceSlug, v ?? ''); }

  clear() {
    localStorage.removeItem(KEYS.baseEmail);
    localStorage.removeItem(KEYS.workspaceSlug);
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

    if (this.workspaceSlug) headers['x-workspace-slug'] = this.workspaceSlug;

    return { ...options, headers };
  }
}
