import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthStoreService } from './auth-store.service';
import { SessionService } from './session.service';

export type TenantOption = { id: string; name: string; slug: string };

/**
 * Tenant switching for super users (platform operators, all tenants) and for people who belong to
 * more than one tenant (the same email has a user, with its own role, in each). Everyone else has
 * one tenant and never sees a switcher. The chosen slug is sent on every API call as x-tenant-slug;
 * the API only honors it for a tenant the person actually belongs to.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly session = inject(SessionService);

  readonly tenants = signal<TenantOption[]>([]);
  readonly currentSlug = signal('');
  readonly canSwitch = computed(() => this.tenants().length > 1);

  async load(): Promise<void> {
    const me = await this.session.getReady();
    if (!me) {
      this.tenants.set([]);
      return;
    }
    const list = await this.api.get<TenantOption[]>('/tenants/mine');
    this.tenants.set(list);
    const stored = this.auth.tenantSlug;
    const own = list.find((t) => t.id === me.tenantId);
    // A super user may sit in any tenant. Everyone else is in the tenant the API actually resolved
    // (their stored choice if it is still one of theirs), so a stale choice is corrected here.
    const slug = me.isSuper && list.some((t) => t.slug === stored) ? stored : (own?.slug ?? list[0]?.slug ?? '');
    this.currentSlug.set(slug);
    if (!me.isSuper) this.auth.tenantSlug = list.length > 1 ? slug : '';
  }

  /** Persist the choice and reload from the dashboard so no data from the old tenant stays on screen. */
  switchTo(slug: string): void {
    if (!slug || slug === this.currentSlug()) return;
    this.auth.tenantSlug = slug;
    window.location.assign('/dashboard');
  }
}
