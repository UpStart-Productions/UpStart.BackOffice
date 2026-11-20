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

/**
 * Can change the plan (date, times, client, type, team member) or cancel / delete it: admins, and whoever put the
 * visit on the schedule. A visit someone else planned for you is a record of what was asked: you log it, you don't
 * rewrite it.
 */
export function canChangePlan(user: UserContext, visit: { createdByUserId: string | null }): boolean {
  if (isAdminRole(user.role)) return true;
  return allows(user, 'schedule', 'edit') && !!visit.createdByUserId && visit.createdByUserId === user.id;
}

/** Can fill in the visit log (actual times, notes, forms): the team member on the visit, or an admin. */
export function canWorkVisit(user: UserContext, visit: { userId: string | null }): boolean {
  if (isAdminRole(user.role)) return true;
  return allows(user, 'schedule', 'edit') && visit.userId === user.id;
}
