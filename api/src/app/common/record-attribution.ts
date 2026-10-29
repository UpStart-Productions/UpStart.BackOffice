import { AsyncLocalStorage } from 'async_hooks';
import { toPublicAssetUrl } from '../storage/asset-url.util';

export const ATTRIBUTED_MODELS = new Set([
  'Client',
  'Contact',
  'Lead',
  'Project',
  'Invoice',
  'Expense',
  'TimeEntry',
  'BookingType',
  'JournalEntry',
  'Account',
  'User',
  'OrganizationProfile',
  'CareRecord',
]);

/** Prisma scalar used for “created by” (Invoice uses createdById). */
const CREATED_BY_FIELD: Partial<Record<string, string>> = {
  Invoice: 'createdById',
};

export type AttributionUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type RecordAttribution = {
  createdBy: AttributionUser | null;
  updatedBy: AttributionUser | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AttributionContext = {
  userId: string | null;
};

export const attributionAls = new AsyncLocalStorage<AttributionContext>();

export const ATTRIBUTION_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  name: true,
  avatarUrl: true,
} as const;

export const ATTRIBUTION_INCLUDE = {
  createdBy: { select: ATTRIBUTION_USER_SELECT },
  updatedBy: { select: ATTRIBUTION_USER_SELECT },
} as const;

export function bindAttributionUser(userId: string | null): void {
  const ctx = attributionAls.getStore();
  if (ctx) ctx.userId = userId;
}

export function toAttributionUser(user: AttributionUser | null | undefined): AttributionUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    name: user.name ?? null,
    avatarUrl: toPublicAssetUrl(user.avatarUrl),
  };
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

export function toRecordAttribution(row: object): RecordAttribution {
  const r = row as {
    createdBy?: AttributionUser | null;
    updatedBy?: AttributionUser | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  };
  return {
    createdBy: toAttributionUser(r.createdBy),
    updatedBy: toAttributionUser(r.updatedBy),
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

function createdField(model: string): string {
  return CREATED_BY_FIELD[model] ?? 'createdByUserId';
}

function applyCreateData(model: string, data: Record<string, unknown>, ctx: AttributionContext): void {
  const createdKey = createdField(model);
  if (data[createdKey] === undefined) data[createdKey] = ctx.userId;
  if (data.updatedByUserId === undefined) data.updatedByUserId = ctx.userId;
}

function applyUpdateData(data: Record<string, unknown>, ctx: AttributionContext): void {
  if (data.updatedByUserId === undefined) data.updatedByUserId = ctx.userId;
}

export function applyAttributionToArgs(
  model: string | undefined,
  operation: string,
  args: { data?: unknown; create?: unknown; update?: unknown },
): void {
  if (!model || !ATTRIBUTED_MODELS.has(model)) return;
  const ctx = attributionAls.getStore();
  if (!ctx?.userId) return;

  if (operation === 'create' && args.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
    applyCreateData(model, args.data as Record<string, unknown>, ctx);
    return;
  }
  if ((operation === 'update' || operation === 'updateMany') && args.data && typeof args.data === 'object') {
    applyUpdateData(args.data as Record<string, unknown>, ctx);
    return;
  }
  if (operation === 'upsert') {
    if (args.create && typeof args.create === 'object') {
      applyCreateData(model, args.create as Record<string, unknown>, ctx);
    }
    if (args.update && typeof args.update === 'object') {
      applyUpdateData(args.update as Record<string, unknown>, ctx);
    }
  }
}

/** Attach attribution DTO to an API view object. */
export function withAttribution<T extends object>(row: object, view: T): T & { attribution: RecordAttribution } {
  return { ...view, attribution: toRecordAttribution(row) };
}
