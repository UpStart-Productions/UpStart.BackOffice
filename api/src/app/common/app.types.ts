import type { UserRole } from '@upstart/back-office/shared';

export type UserContext = {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  clientId?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: UserContext;
      /** Set by PortalSessionGuard after magic-link or session cookie auth. */
      portalClientId?: string;
    }
  }
}
