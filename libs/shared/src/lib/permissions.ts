import type { UserRole } from './types';
import { areaEnabled } from './modules';

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
  'forms',
  'inbox',
  'projects',
  'tasks',
  'time',
  'expenses',
  'invoices',
  'reports',
  'care',
  'visits',
  'schedule',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type AccessLevel = 'own' | 'all';
export type RolePermissions = Partial<Record<PermissionArea, AccessLevel>>;

/** Areas where "own" makes sense (the record has an owner or members). Every other area is all-or-nothing. */
export const OWNABLE_AREAS: readonly PermissionArea[] = ['clients', 'contacts', 'forms', 'projects', 'tasks', 'time', 'expenses', 'invoices', 'visits', 'schedule'];

export const PERMISSION_LABELS: Record<PermissionArea, string> = {
  /** Organizations and the Clients list (the same records). */
  clients: 'Organizations',
  contacts: 'People',
  pipeline: 'Pipeline',
  bookings: 'Bookings',
  /** Free-standing forms (Forms area). Own = forms the person created. */
  forms: 'Forms',
  inbox: 'Activity',
  projects: 'Projects',
  tasks: 'Tasks',
  time: 'Time',
  expenses: 'Expenses',
  invoices: 'Invoices',
  reports: 'Reports',
  care: 'Care forms',
  visits: 'Visits',
  schedule: 'Schedule',
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

// ---------------------------------------------------------------------------------------------------------------
// Actions: what a role may DO in an area, on top of what it may SEE (the level above).
// Checkboxes, not scopes: an action applies to the records the user can already see.
// A missing action counts as allowed, so roles saved before actions existed keep exactly the access they had.
// ---------------------------------------------------------------------------------------------------------------

export const ROLE_ACTIONS = ['create', 'edit', 'delete', 'setup'] as const;
export type RoleAction = (typeof ROLE_ACTIONS)[number];
/** What a request needs: 'view' is the area level itself; the others are checkboxes. */
export type AreaAction = 'view' | RoleAction;
export type AreaActions = Partial<Record<RoleAction, boolean>>;
export type RoleActions = Partial<Record<PermissionArea, AreaActions>>;

export const ACTION_LABELS: Record<RoleAction, string> = {
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  setup: 'Setup',
};

/** Areas with something to configure: Pipeline (pipelines and lanes), Bookings (booking types), Care (forms). */
export const SETUP_AREAS: readonly PermissionArea[] = ['pipeline', 'bookings', 'care'];

/**
 * Areas whose only checkbox is Setup. Care: what a role can read or edit is set per form (Customize fields),
 * and which clients by Clients reach (assigned clients unless Organizations is All).
 */
export const SETUP_ONLY_AREAS: readonly PermissionArea[] = ['care'];

/** Areas that only show information; actions don't apply. */
export const VIEW_ONLY_AREAS: readonly PermissionArea[] = ['reports'];

/** The checkboxes that make sense for an area. */
export function actionsFor(area: PermissionArea): RoleAction[] {
  if (VIEW_ONLY_AREAS.includes(area)) return [];
  if (SETUP_ONLY_AREAS.includes(area)) return ['setup'];
  return ROLE_ACTIONS.filter((a) => a !== 'setup' || SETUP_AREAS.includes(area));
}

/** Keep known areas and actions with boolean values only. */
export function sanitizeActions(input: unknown): RoleActions {
  const out: RoleActions = {};
  if (!input || typeof input !== 'object') return out;
  for (const [area, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isPermissionArea(area) || !value || typeof value !== 'object') continue;
    const allowed = actionsFor(area);
    const acts: AreaActions = {};
    for (const [action, flag] of Object.entries(value as Record<string, unknown>)) {
      if ((allowed as string[]).includes(action) && typeof flag === 'boolean') acts[action as RoleAction] = flag;
    }
    if (Object.keys(acts).length) out[area] = acts;
  }
  return out;
}

type WithAccess = {
  role: UserRole;
  permissions?: RolePermissions | null;
  actions?: RoleActions | null;
  /** The current tenant's modules (admin app). An area of a module that is off doesn't exist, even for admins. */
  modules?: readonly string[] | null;
};

/**
 * Whether the user may take an action in an area. Admins may do everything. Anyone else needs the area
 * (any level) and, for create/edit/delete/setup, the checkbox (a missing checkbox counts as allowed).
 */
export function allows(user: WithAccess | null | undefined, area: PermissionArea, action: AreaAction): boolean {
  if (!user) return false;
  if (!areaEnabled(user.modules, area)) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'USER') return false;
  if (!user.permissions?.[area]) return false;
  if (action === 'view') return true;
  return user.actions?.[area]?.[action] !== false;
}

// ---------------------------------------------------------------------------------------------------------------
// Preset roles: every tenant starts with the same set and may edit them. Admin is a user type, not a role.
// ---------------------------------------------------------------------------------------------------------------

export type RolePreset = { key: string; name: string; permissions: RolePermissions; actions: RoleActions };

const ALL: AreaActions = { create: true, edit: true, delete: true };
const ALL_SETUP: AreaActions = { ...ALL, setup: true };
const NO_DELETE: AreaActions = { create: true, edit: true, delete: false };
const NO_DELETE_SETUP: AreaActions = { ...NO_DELETE, setup: false };
const VIEW_ONLY: AreaActions = { create: false, edit: false, delete: false };

export const ROLE_PRESETS: readonly RolePreset[] = [
  {
    key: 'manager',
    name: 'Manager',
    permissions: {
      clients: 'all', contacts: 'all', pipeline: 'all', bookings: 'all', forms: 'all', inbox: 'all',
      projects: 'all', tasks: 'all', time: 'all', expenses: 'all', invoices: 'all', reports: 'all', care: 'all', visits: 'all', schedule: 'all',
    },
    actions: {
      clients: ALL, contacts: ALL, pipeline: ALL_SETUP, bookings: ALL_SETUP, forms: ALL, inbox: ALL,
      projects: ALL, tasks: ALL, time: ALL, expenses: ALL, invoices: ALL, care: { setup: true }, visits: ALL, schedule: ALL,
    },
  },
  {
    key: 'team-member',
    name: 'Team member',
    permissions: {
      clients: 'all', contacts: 'all', pipeline: 'all', bookings: 'all', inbox: 'all',
      projects: 'own', tasks: 'own', time: 'own', expenses: 'own',
    },
    actions: {
      clients: NO_DELETE, contacts: NO_DELETE, pipeline: NO_DELETE_SETUP, bookings: NO_DELETE_SETUP, inbox: NO_DELETE,
      projects: ALL, tasks: ALL, time: ALL, expenses: ALL,
    },
  },
  {
    key: 'coordinator',
    name: 'Coordinator',
    permissions: { inbox: 'all', contacts: 'all', pipeline: 'all', bookings: 'all', clients: 'all' },
    actions: {
      inbox: NO_DELETE, contacts: NO_DELETE, pipeline: NO_DELETE_SETUP, bookings: NO_DELETE_SETUP,
      clients: { create: false, edit: true, delete: false },
    },
  },
  {
    key: 'bookkeeper',
    name: 'Bookkeeper',
    permissions: { invoices: 'all', reports: 'all', time: 'all', expenses: 'all', clients: 'all' },
    actions: { invoices: ALL, time: VIEW_ONLY, expenses: VIEW_ONLY, clients: VIEW_ONLY },
  },
  {
    key: 'contractor',
    name: 'Contractor',
    permissions: { projects: 'own', tasks: 'own', time: 'own', expenses: 'own' },
    actions: { projects: { create: false, edit: true, delete: false }, tasks: ALL, time: ALL, expenses: ALL },
  },
  { key: GUEST_ROLE.key, name: GUEST_ROLE.name, permissions: { tasks: 'own' }, actions: { tasks: ALL } },
];

/** The user's level in an area: admins have 'all' everywhere; null means no access. */
export function areaLevel(user: WithAccess | null | undefined, area: PermissionArea): AccessLevel | null {
  if (!user) return null;
  if (!areaEnabled(user.modules, area)) return null;
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
