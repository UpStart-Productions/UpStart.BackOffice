import type { Prisma } from '@prisma/client';
import type { AccessService } from '../access/access.service';
import type { UserContext } from '../common/app.types';
import type { TaskAccessService } from '../task-manager/task-access.service';

/** Time list scope (matches TimeEntriesController). */
export async function timeEntryScope(
  access: AccessService,
  user: UserContext,
): Promise<Prisma.TimeEntryWhereInput> {
  if (access.level(user, 'time') === 'own') return access.ownTimeWhere(user);
  const clientIds = await access.clientIdFilter(user);
  return clientIds ? { OR: [{ clientId: clientIds }, { userId: user.id }] } : {};
}

/** Expense list scope (matches ExpensesController). */
export async function expenseScope(
  access: AccessService,
  user: UserContext,
): Promise<Prisma.ExpenseWhereInput> {
  const clientIds = await access.clientIdFilter(user);
  return {
    AND: [
      access.level(user, 'expenses') === 'own' ? await access.ownExpenseWhere(user) : {},
      clientIds ? { OR: [{ project: { clientId: clientIds } }, { projectId: null, userId: user.id }] } : {},
    ],
  };
}

/** Care visit list scope (matches CareVisitsController). */
export async function careVisitScope(
  access: AccessService,
  user: UserContext,
): Promise<Prisma.CareVisitWhereInput> {
  if (access.level(user, 'visits') !== 'all') return { userId: user.id };
  const reach = await access.clientIdFilter(user);
  return reach ? { clientId: reach } : {};
}

/** Care shift list scope (matches CareShiftsController). */
export async function careShiftScope(
  access: AccessService,
  user: UserContext,
): Promise<Prisma.CareShiftWhereInput> {
  if (access.level(user, 'schedule') !== 'all') return { userId: user.id };
  const reach = await access.clientIdFilter(user);
  return reach ? { clientId: reach } : {};
}

/** Free-standing forms the user may see (matches FreeFormsController). */
export function formsOwnWhere(access: AccessService, user: UserContext): Prisma.FormWhereInput {
  return access.level(user, 'forms') === 'own' ? { createdById: user.id } : {};
}

/** Task Manager tasks visible to the user (open tasks in TM projects). */
export async function taskVisibilityWhere(
  taskAccess: TaskAccessService,
  user: UserContext,
): Promise<Prisma.TaskWhereInput> {
  const visible = await taskAccess.visibleProjectIds(user);
  const projectScope: Prisma.TaskWhereInput = visible
    ? {
        OR: [
          { projectId: { in: visible } },
          { projectLinks: { some: { projectId: { in: visible } } } },
        ],
      }
    : {};
  return {
    project: { inTaskManager: true },
    ...projectScope,
  };
}
