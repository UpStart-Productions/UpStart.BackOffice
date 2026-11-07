import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { GUEST_ROLE, isAdminRole, type AccessLevel, type PermissionArea } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { ensurePresetRoles } from './role-presets.util';

/** Users who have an area at a level (admins always do). For queries like "who can see every Task Manager project". */
export function usersWithArea(area: PermissionArea, level: 'all' | 'any' = 'any'): Prisma.UserWhereInput {
  const grant: Prisma.UserWhereInput =
    level === 'all'
      ? { role: 'USER', tenantRole: { permissions: { path: [area], equals: 'all' } } }
      : { role: 'USER', OR: [{ tenantRole: { permissions: { path: [area], equals: 'all' } } }, { tenantRole: { permissions: { path: [area], equals: 'own' } } }] };
  return { OR: [{ role: 'ADMIN' }, grant] };
}

/** The tenant's own people: admins and users on any role except the built-in Guest role (external collaborators). */
export function teamUsersWhere(): Prisma.UserWhereInput {
  return {
    OR: [
      { role: 'ADMIN' },
      { role: 'USER', OR: [{ roleId: null }, { tenantRole: { key: null } }, { tenantRole: { key: { not: GUEST_ROLE.key } } }] },
    ],
  };
}

/**
 * What a signed-in user may reach. Admins can do everything; other users get what their tenant role grants,
 * per area at level 'all' or 'own'. See libs/shared permissions.ts for what 'own' means per area.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's level in an area, or null for no access. */
  level(user: UserContext, area: PermissionArea): AccessLevel | null {
    if (isAdminRole(user.role)) return 'all';
    if (user.role !== 'USER') return null;
    return user.permissions?.[area] ?? null;
  }

  can(user: UserContext, area: PermissionArea): boolean {
    return this.level(user, area) !== null;
  }

  /**
   * Clients the user may reach: null means all of them. Anyone without Clients at 'all' is limited to the
   * clients they are assigned to, even with no Clients area at all (a caregiver logging time still
   * needs to pick the client they were assigned).
   */
  async clientIds(user: UserContext): Promise<string[] | null> {
    if (this.level(user, 'clients') === 'all') return null;
    const rows = await this.prisma.clientAssignment.findMany({
      where: { userId: user.id },
      select: { clientId: true },
    });
    return rows.map((r) => r.clientId);
  }

  /** Prisma filter for a clientId column: undefined when unrestricted. */
  async clientIdFilter(user: UserContext): Promise<{ in: string[] } | undefined> {
    const ids = await this.clientIds(user);
    return ids === null ? undefined : { in: ids };
  }

  /**
   * Projects the user may reach: undefined means all of them.
   * Projects at 'all': every project, limited to assigned clients (and internal projects) when Clients isn't 'all'.
   * Otherwise ('own', or no Projects area but picking a project for time/expenses): projects they are a member of,
   * plus projects for clients they are assigned to.
   */
  async projectFilter(user: UserContext): Promise<Prisma.ProjectWhereInput | undefined> {
    const clientIds = await this.clientIds(user);
    if (this.level(user, 'projects') === 'all') {
      return clientIds === null ? undefined : { OR: [{ clientId: { in: clientIds } }, { clientId: null }] };
    }
    return {
      OR: [
        { members: { some: { userId: user.id } } },
        ...(clientIds?.length ? [{ clientId: { in: clientIds } }] : []),
      ],
    };
  }

  /** The tenant's built-in Guest role, given to people invited to a Task Manager project. */
  async guestRoleId(): Promise<string> {
    await ensurePresetRoles(this.prisma);
    const role = await this.prisma.role.findFirst({ where: { key: GUEST_ROLE.key }, select: { id: true } });
    if (!role) throw new Error('Guest role missing');
    return role.id;
  }

  /** Projects the user leads (ProjectMember OWNER, shown as "Lead"). Leads see all time, expenses and invoices on them. */
  async ledProjectIds(user: UserContext): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({ where: { userId: user.id, role: 'OWNER' }, select: { projectId: true } });
    return rows.map((r) => r.projectId);
  }

  /** Time entries at 'own': the person's own, plus every entry on projects they lead. */
  async ownTimeWhere(user: UserContext): Promise<Prisma.TimeEntryWhereInput> {
    const led = await this.ledProjectIds(user);
    return led.length ? { OR: [{ userId: user.id }, { projectId: { in: led } }] } : { userId: user.id };
  }

  /** Expenses at 'own': the person's own, plus every expense on projects they lead. */
  async ownExpenseWhere(user: UserContext): Promise<Prisma.ExpenseWhereInput> {
    const led = await this.ledProjectIds(user);
    return led.length ? { OR: [{ userId: user.id }, { projectId: { in: led } }] } : { userId: user.id };
  }

  /** Invoices at 'own': ones the person created, plus any invoice with time or expenses from projects they lead. */
  async ownInvoiceWhere(user: UserContext): Promise<Prisma.InvoiceWhereInput> {
    const led = await this.ledProjectIds(user);
    if (!led.length) return { createdById: user.id };
    const onLed = { projectId: { in: led } };
    return {
      OR: [
        { createdById: user.id },
        {
          lineItems: {
            some: {
              OR: [
                { timeEntries: { some: onLed } },
                { tenantTimeEntries: { some: onLed } },
                { expenses: { some: onLed } },
                { tenantExpenses: { some: onLed } },
              ],
            },
          },
        },
      ],
    };
  }

  /** People on projects the user leads (for "whose time can I view"). */
  async ledProjectPeopleIds(user: UserContext): Promise<string[]> {
    const led = await this.ledProjectIds(user);
    if (!led.length) return [];
    const rows = await this.prisma.projectMember.findMany({ where: { projectId: { in: led } }, select: { userId: true }, distinct: ['userId'] });
    return rows.map((r) => r.userId);
  }
}
