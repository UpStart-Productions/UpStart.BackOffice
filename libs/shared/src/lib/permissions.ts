import type { UserRole } from './types';

/**
 * App areas a tenant-defined role can be granted, each at a level:
 *   'all' - everything in the area
 *   'own' - only records the person created, logged, was assigned, or is a member of.
 *           For Clients (and Contacts, via their clients) it means the clients they are assigned to.
 * A missing area means no access, and a user with no role has no access. Admins (UserRole.ADMIN) can use everything and are not limited by
 * these. Accounting, Users, Settings and Tenants are admin-only and not listed.
 * Each area is also the nav section a user sees and guards the matching API endpoints.
 */
export const PERMISSION_AREAS = [
  'clients',
  'contacts',
  'pipeline',
  'bookings',
  'network',
  'inbox',
  'projects',
  'tasks',
  'time',
  'expenses',
  'invoices',
  'reports',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type AccessLevel = 'own' | 'all';
export type RolePermissions = Partial<Record<PermissionArea, AccessLevel>>;

/** Areas where "own" makes sense (the record has an owner or members). Every other area is all-or-nothing. */
export const OWNABLE_AREAS: readonly PermissionArea[] = ['clients', 'contacts', 'projects', 'tasks', 'time', 'expenses', 'invoices'];

export const PERMISSION_LABELS: Record<PermissionArea, string> = {
  clients: 'Clients',
  contacts: 'Contacts',
  pipeline: 'Pipeline',
  bookings: 'Bookings',
  network: 'Network',
  inbox: 'Inbox',
  projects: 'Projects',
  tasks: 'Tasks',
  time: 'Time',
  expenses: 'Expenses',
  invoices: 'Invoices',
  reports: 'Reports',
};

export function isPermissionArea(value: string): value is PermissionArea {
  return (PERMISSION_AREAS as readonly string[]).includes(value);
}

/** Drop unknown areas and levels, and downgrade nothing: "own" on a non-ownable area is rejected. */
export function sanitizePermissions(input: unknown): RolePermissions {
  const out: RolePermissions = {};
  if (!input || typeof input !== 'object') return out;
  for (const [area, level] of Object.entries(input as Record<string, unknown>)) {
    if (!isPermissionArea(area)) continue;
    if (level === 'all') out[area] = 'all';
    else if (level === 'own' && OWNABLE_AREAS.includes(area)) out[area] = 'own';
  }
  return out;
}

/** Built-in role given to people invited to a Task Manager project by email: only projects they are a member of. */
export const GUEST_ROLE = { key: 'guest', name: 'Guest', permissions: { tasks: 'own' } as RolePermissions } as const;

type WithAccess = { role: UserRole; permissions?: RolePermissions | null };

/** The user's level in an area: admins have 'all' everywhere; null means no access. */
export function areaLevel(user: WithAccess | null | undefined, area: PermissionArea): AccessLevel | null {
  if (!user) return null;
  if (user.role === 'ADMIN') return 'all';
  if (user.role !== 'USER') return null;
  return user.permissions?.[area] ?? null;
}

/** A role that only grants Tasks (like Guest): the app is just the Task Manager for them. */
export function tasksOnly(user: WithAccess | null | undefined): boolean {
  if (!user || user.role !== 'USER') return false;
  const areas = Object.keys(user.permissions ?? {});
  return areas.length === 1 && areas[0] === 'tasks';
}
