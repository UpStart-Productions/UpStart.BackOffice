import type { PermissionArea } from './permissions';

/**
 * Modules: optional parts of the app that the platform operator switches on per tenant (Tenants page).
 * A module owns one or more permission areas. When it is off for a tenant, its areas don't exist there:
 * no nav items, no role checkboxes, and the API answers 404. Turning a module off keeps its data.
 * Areas that no module owns are core and always on.
 */
export const MODULES = {
  bookings: { label: 'Bookings', areas: ['bookings'] },
  /** In-home care: intake forms, care profiles (later visits, schedule, training). */
  care: { label: 'Care', areas: ['care', 'visits', 'schedule'] },
} as const satisfies Record<string, { label: string; areas: readonly PermissionArea[] }>;

export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

/** What a new tenant starts with (also the column default for existing tenants). */
export const DEFAULT_MODULES: readonly ModuleKey[] = ['bookings'];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as string[]).includes(value);
}

/** The module that owns an area, or null for a core area. */
export function moduleForArea(area: PermissionArea): ModuleKey | null {
  for (const key of MODULE_KEYS) {
    if ((MODULES[key].areas as readonly string[]).includes(area)) return key;
  }
  return null;
}

/**
 * Whether an area exists for a tenant with these modules. Core areas always do.
 * `modules` undefined/null means "not known here" (e.g. the API's user object) and allows the area;
 * the API enforces modules separately, per request.
 */
export function areaEnabled(modules: readonly string[] | null | undefined, area: PermissionArea): boolean {
  if (!modules) return true;
  const key = moduleForArea(area);
  return !key || modules.includes(key);
}

/** Keep known module keys only, without duplicates. */
export function sanitizeModules(input: unknown): ModuleKey[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((m): m is ModuleKey => typeof m === 'string' && isModuleKey(m)))];
}
