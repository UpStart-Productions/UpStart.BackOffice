import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';

export type TenantBranding = {
  companyName: string;
  logoUrl: string | null;
};

/** Tenant logo and company name from Settings → Business (for top bar and shared UI). */
@Injectable({ providedIn: 'root' })
export class TenantBrandingService {
  private readonly api = inject(ApiService);

  readonly companyName = signal('');
  readonly logoUrl = signal<string | null>(null);

  async load(): Promise<void> {
    try {
      const branding = await this.api.get<TenantBranding>('/organization-profile/branding');
      this.apply(branding);
    } catch {
      this.companyName.set('');
      this.logoUrl.set(null);
    }
  }

  apply(branding: TenantBranding | null | undefined): void {
    this.companyName.set(branding?.companyName?.trim() ?? '');
    this.logoUrl.set(branding?.logoUrl ?? null);
  }
}
