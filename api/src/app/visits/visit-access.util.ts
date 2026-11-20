import { Prisma } from '@prisma/client';
import { allows, isAdminRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { AccessService } from '../access/access.service';

/**
 * Which visits a user sees. Schedule Own: their own visits. All: everyone's, at the clients they reach.
 * Shared by the Schedule, search and client forms (who may fill in a visit's forms).
 */
export async function visitScope(access: AccessService, user: UserContext): Promise<Prisma.VisitWhereInput> {
  if (!isAdminRole(user.role) && access.level(user, 'schedule') !== 'all') return { userId: user.id };
  const reach = await access.clientIdFilter(user);
  return reach ? { clientId: reach } : {};
}

/** Can change a visit the user sees (plan, notes, actual times). */
export function canEditVisit(user: UserContext): boolean {
  return isAdminRole(user.role) || allows(user, 'schedule', 'edit');
}

/** Can start and finish a visit and fill in its forms: the team member on it, or someone who sees everyone's visits. */
export function canWorkVisit(access: AccessService, user: UserContext, visit: { userId: string | null }): boolean {
  if (!canEditVisit(user)) return false;
  return visit.userId === user.id || isAdminRole(user.role) || access.level(user, 'schedule') === 'all';
}
