import { Injectable } from '@nestjs/common';
import { isAdminRole, type AccessLevel, type PermissionArea } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What a signed-in user may reach. Admins can do everything; staff get what their tenant role grants,
 * per area at level 'all' or 'own'. See libs/shared permissions.ts for what 'own' means per area.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's level in an area, or null for no access. */
  level(user: UserContext, area: PermissionArea): AccessLevel | null {
    if (isAdminRole(user.role)) return 'all';
    if (user.role !== 'MEMBER') return null;
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
}
