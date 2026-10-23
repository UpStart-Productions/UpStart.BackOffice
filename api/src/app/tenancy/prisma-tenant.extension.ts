import { Prisma } from '@prisma/client';
import { isUnscoped, tryTenantId } from './tenant-context';

/**
 * Central tenant enforcement. Every query on a tenant-owned model is scoped to the tenant in
 * context (see tenant-context.ts), so individual services never have to remember a tenant filter.
 *
 *  - reads / updates / deletes : tenantId is ANDed into `where`
 *  - creates                   : tenantId is injected, including nested creates / connectOrCreate / upsert
 *  - no tenant in context      : throws (use runWithTenant / runUnscoped explicitly)
 *
 * Models and relations come from Prisma's DMMF, so new models are covered automatically.
 */

type Json = Record<string, any>;

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const hasTenant = (model: string) => !!models.get(model)?.fields.some((f) => f.name === 'tenantId');

const WHERE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'findUnique', 'findUniqueOrThrow', 'update', 'delete', 'updateMany', 'updateManyAndReturn', 'deleteMany',
]);

/** Add the tenant to one create payload, picking the input style Prisma will accept. */
function withTenant(model: string, data: Json, tenantId: string): Json {
  const m = models.get(model);
  if (!m || !hasTenant(model)) return data;
  const out: Json = { ...data };
  // Checked input (uses relation fields) can't also carry a scalar FK, so connect the tenant instead.
  const usesRelations = m.fields.some((f) => f.kind === 'object' && f.name !== 'tenant' && f.name in out);
  if ('tenantId' in out || 'tenant' in out) {
    // caller supplied one: never trust it
    delete out.tenantId;
    delete out.tenant;
  }
  if (usesRelations) out.tenant = { connect: { id: tenantId } };
  else out.tenantId = tenantId;
  return scopeNested(model, out, tenantId);
}

/** Walk relation fields in a write payload and inject the tenant into nested creates. */
function scopeNested(model: string, data: Json, tenantId: string): Json {
  const m = models.get(model);
  if (!m) return data;
  for (const f of m.fields) {
    if (f.kind !== 'object' || f.name === 'tenant') continue;
    const v = data[f.name];
    if (!v || typeof v !== 'object') continue;
    const target = f.type;
    const next: Json = { ...v };
    const each = (x: any, fn: (d: Json) => Json) => (Array.isArray(x) ? x.map(fn) : fn(x));
    if (next.create) next.create = each(next.create, (d) => withTenant(target, d, tenantId));
    if (next.createMany) {
      const cm = { ...next.createMany };
      cm.data = each(cm.data, (d) => (hasTenant(target) ? { ...d, tenantId } : d));
      next.createMany = cm;
    }
    if (next.connectOrCreate) {
      next.connectOrCreate = each(next.connectOrCreate, (c) => ({ ...c, create: withTenant(target, c.create, tenantId) }));
    }
    if (next.upsert) {
      next.upsert = each(next.upsert, (u) => ({
        ...u,
        create: withTenant(target, u.create, tenantId),
        update: scopeNested(target, u.update ?? {}, tenantId),
      }));
    }
    for (const k of ['update', 'updateMany']) {
      if (next[k]) next[k] = each(next[k], (u) => (u.data ? { ...u, data: scopeNested(target, u.data, tenantId) } : scopeNested(target, u, tenantId)));
    }
    data[f.name] = next;
  }
  return data;
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isUnscoped() || !hasTenant(model)) return query(args);

        const tenantId = tryTenantId();
        if (!tenantId) {
          throw new Error(`Tenant required: ${model}.${operation} ran with no tenant in context.`);
        }

        const a: Json = { ...(args as Json) };

        if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), tenantId };

        switch (operation) {
          case 'create':
            a.data = withTenant(model, a.data, tenantId);
            break;
          case 'createMany':
          case 'createManyAndReturn':
            a.data = Array.isArray(a.data)
              ? a.data.map((d: Json) => ({ ...d, tenantId }))
              : { ...a.data, tenantId };
            break;
          case 'update':
          case 'updateMany':
          case 'updateManyAndReturn':
            if (a.data) {
              const { tenantId: _t, tenant: _tn, ...rest } = a.data; // never allow moving a row between tenants
              a.data = scopeNested(model, rest, tenantId);
            }
            break;
          case 'upsert':
            a.where = { ...(a.where ?? {}), tenantId };
            a.create = withTenant(model, a.create, tenantId);
            if (a.update) {
              const { tenantId: _t, tenant: _tn, ...rest } = a.update;
              a.update = scopeNested(model, rest, tenantId);
            }
            break;
        }
        return query(a as typeof args);
      },
    },
  },
});
