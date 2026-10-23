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

/**
 * Prisma queries are lazy: they only run when awaited. If fn() returns one un-awaited, it would
 * start after the scope has closed and lose the tenant. So start any such thenable inside the scope.
 */
function startInScope<T>(result: T): T {
  const thenable = result as unknown as PromiseLike<unknown> | null;
  if (thenable && typeof thenable.then === 'function' && !(result instanceof Promise)) {
    return new Promise((resolve, reject) => thenable.then(resolve, reject)) as unknown as T;
  }
  return result;
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId, unscoped: false }, () => startInScope(fn()));
}

/** Escape hatch for code that must see across tenants. Keep call sites few and obvious. */
export function runUnscoped<T>(fn: () => T): T {
  return storage.run({ tenantId: null, unscoped: true }, () => startInScope(fn()));
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
