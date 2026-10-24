import type { RoleActions, RolePermissions, UserRole } from '@upstart/back-office/shared';

export type UserContext = {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  clientId?: string | null;
  /** The user's tenant. Null only for super users (platform operators), who pick one per request. */
  tenantId?: string | null;
  /** Platform operator: may act in any tenant via the x-tenant-slug header. */
  isSuper?: boolean;
  /** Areas the user's tenant role grants (admins ignore this and can do everything). */
  permissions?: RolePermissions;
  /** What the role may do per area (create/edit/delete/setup); missing = allowed. */
  actions?: RoleActions;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: UserContext;
      /** Set by PortalSessionGuard after magic-link or session cookie auth. */
      portalClientId?: string;
      /** Tenant for requests with no user: set by ServiceKeyGuard and PortalSessionGuard. */
      tenantId?: string;
      /** Set when a platform admin is acting as request.user (the real caller). */
      impersonatedBy?: { id: string; email: string };
    }
  }
}
