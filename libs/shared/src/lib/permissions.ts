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
  care: 'Care',
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

/** Areas with something to configure: Pipeline (pipelines and lanes), Bookings (booking types), Care (who is in care). */
export const SETUP_AREAS: readonly PermissionArea[] = ['pipeline', 'bookings', 'care'];

/**
 * Areas whose only checkbox is Setup. Care: seeing a client's care status; Setup adds clients to care and changes
 * their status. Which clients: Clients reach (assigned clients unless Organizations is All).
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
// Roles are fixed. Every tenant has exactly three kinds of user, and nobody edits them:
//   Admin  - a user type (UserRole.ADMIN), not a Role row: everything in the tenant, including money and setup.
//   Member - the tenant's own staff: all of CRM, plus the projects they are assigned to.
//   Guest  - outside people (contractors, vendors, collaborators): only the projects and clients they are assigned to.
// "Own" work (tasks, time, expenses, invoices, visits, schedule) is the person's own, plus everything on projects
// they lead (ProjectMember role OWNER, shown as "Lead"). Only admins delete CRM records and projects.
// The Role rows still exist (users point at them) but their permissions and actions always come from here.
// ---------------------------------------------------------------------------------------------------------------

export type RolePreset = { key: string; name: string; description: string; permissions: RolePermissions; actions: RoleActions };

const ALL: AreaActions = { create: true, edit: true, delete: true };
const NO_DELETE: AreaActions = { create: true, edit: true, delete: false };
const NO_DELETE_SETUP: AreaActions = { ...NO_DELETE, setup: false };
const EDIT_ONLY: AreaActions = { create: false, edit: true, delete: false };

export const MEMBER_ROLE: RolePreset = {
  key: 'member',
  name: 'Member',
  description: 'Staff. Sees all of CRM and the projects they are assigned to. Sees only their own time, expenses and invoices, plus everything on projects they lead. Can’t delete records or change setup.',
  permissions: {
    clients: 'all', contacts: 'all', pipeline: 'all', bookings: 'all', forms: 'all', inbox: 'all', care: 'all',
    projects: 'own', tasks: 'own', time: 'own', expenses: 'own', invoices: 'own', visits: 'own', schedule: 'own',
  },
  actions: {
    clients: NO_DELETE, contacts: NO_DELETE, pipeline: NO_DELETE_SETUP, bookings: NO_DELETE_SETUP, forms: NO_DELETE, inbox: NO_DELETE,
    care: { setup: false }, projects: NO_DELETE,
    tasks: ALL, time: ALL, expenses: ALL, invoices: ALL, visits: ALL, schedule: ALL,
  },
};

export const GUEST_ROLE: RolePreset = {
  key: 'guest',
  name: 'Guest',
  description: 'Outside people such as contractors, vendors and collaborators. Sees only the projects and clients they are assigned to, and only their own time, expenses and invoices, plus everything on projects they lead. No Pipeline, Bookings, Activity or Forms.',
  permissions: {
    clients: 'own', contacts: 'own', care: 'all',
    projects: 'own', tasks: 'own', time: 'own', expenses: 'own', invoices: 'own', visits: 'own', schedule: 'own',
  },
  actions: {
    clients: EDIT_ONLY, contacts: EDIT_ONLY, care: { setup: false }, projects: EDIT_ONLY,
    tasks: ALL, time: ALL, expenses: ALL, invoices: ALL, visits: ALL, schedule: ALL,
  },
};

/** The only Role rows a tenant has. */
export const ROLE_PRESETS: readonly RolePreset[] = [MEMBER_ROLE, GUEST_ROLE];

/** A built-in role by key. */
export function presetFor(key: string | null | undefined): RolePreset | undefined {
  return key ? ROLE_PRESETS.find((p) => p.key === key) : undefined;
}

/** What a Role row grants: always the built-in definition for its key; an unknown role grants nothing. */
export function roleAccess(role: { key?: string | null } | null | undefined): { permissions: RolePermissions; actions: RoleActions } {
  const preset = presetFor(role?.key);
  return preset ? { permissions: preset.permissions, actions: preset.actions } : { permissions: {}, actions: {} };
}

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
