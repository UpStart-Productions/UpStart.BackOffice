/**
 * App areas a tenant-defined role can be granted, each at a level:
 *   'all' - everything in the area
 *   'own' - only records the person created, logged, was assigned, or is a member of.
 *           For Clients (and Contacts, via their clients) it means the clients they are assigned to.
 * A missing area means no access. Admins (UserRole.ADMIN) can use everything and are not limited by
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
