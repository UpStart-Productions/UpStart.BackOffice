import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant scope. Set once by TenantInterceptor (HTTP) or runWithTenant (scripts/jobs);
 * read by the Prisma extension, which scopes every query to this tenant.
 */
interface TenantStore {
  tenantId: string | null;
  /** True inside runUnscoped(): queries are not filtered (auth lookups, tenant admin, migrations). */
  unscoped: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId, unscoped: false }, fn);
}

/** Escape hatch for code that must see across tenants. Keep call sites few and obvious. */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ tenantId: null, unscoped: true }, fn);
}

export function isUnscoped(): boolean {
  return storage.getStore()?.unscoped === true;
}

export function tryTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/** The current tenant id. Throws when there is none, so a missing scope fails loudly, never leaks. */
export function currentTenantId(): string {
  const id = tryTenantId();
  if (!id) throw new Error('No tenant in context. Wrap the call in runWithTenant() or runUnscoped().');
  return id;
}
