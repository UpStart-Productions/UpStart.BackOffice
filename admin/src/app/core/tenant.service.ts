import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthStoreService } from './auth-store.service';
import { SessionService } from './session.service';

export type TenantOption = { id: string; name: string; slug: string };

/**
 * Tenant switching for super users (platform operators). Regular users belong to exactly one
 * tenant and never see this. The chosen slug is sent on every API call as x-tenant-slug.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly session = inject(SessionService);

  readonly tenants = signal<TenantOption[]>([]);
  readonly currentSlug = signal('');
  readonly canSwitch = computed(() => this.session.me()?.isSuper === true && this.tenants().length > 1);

  async load(): Promise<void> {
    const me = await this.session.getReady();
    if (!me?.isSuper) {
      this.auth.tenantSlug = ''; // a stale choice from a previous super login must not linger
      this.tenants.set([]);
      return;
    }
    const list = await this.api.get<TenantOption[]>('/tenants/mine');
    this.tenants.set(list);
    const stored = this.auth.tenantSlug;
    const own = list.find((t) => t.id === me.tenantId);
    const slug = list.some((t) => t.slug === stored) ? stored : (own?.slug ?? list[0]?.slug ?? '');
    this.currentSlug.set(slug);
  }

  /** Persist the choice and reload from the dashboard so no data from the old tenant stays on screen. */
  switchTo(slug: string): void {
    if (!slug || slug === this.currentSlug()) return;
    this.auth.tenantSlug = slug;
    window.location.assign('/dashboard');
  }
}
