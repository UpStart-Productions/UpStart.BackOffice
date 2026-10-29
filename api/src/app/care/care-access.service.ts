import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { allows, isAdminRole, type CareFormAccessLevel } from '@upstart/back-office/shared';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeFormAccess } from './care-forms.util';

/**
 * Who may do what with Care forms:
 *  - The Care area (role) opens the module; its Setup checkbox manages forms and public links.
 *  - Each form sets Read or Edit per role (admins always edit).
 *  - Which organizations: Clients reach (all with Organizations = All, otherwise assigned ones).
 *  - Pending public intakes have no organization yet: only people with Edit on the intake form who
 *    can reach every organization see them.
 */
@Injectable()
export class CareAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async roleId(user: UserContext): Promise<string | null> {
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { roleId: true } });
    return row?.roleId ?? null;
  }

  /** The user's access to a form, or null. */
  async formAccess(user: UserContext, form: { access: unknown }, roleId?: string | null): Promise<CareFormAccessLevel | null> {
    if (isAdminRole(user.role)) return 'edit';
    if (!allows(user, 'care', 'view')) return null;
    const rid = roleId === undefined ? await this.roleId(user) : roleId;
    if (!rid) return null;
    return sanitizeFormAccess(form.access)[rid] ?? null;
  }

  canSetup(user: UserContext): boolean {
    return allows(user, 'care', 'setup');
  }

  assertSetup(user: UserContext) {
    if (!this.canSetup(user)) throw new ForbiddenException("Your role can't change Care forms");
  }

  /** Organizations the user may reach: null means all. */
  clientIds(user: UserContext): Promise<string[] | null> {
    return this.access.clientIds(user);
  }

  async assertClient(user: UserContext, clientId: string) {
    const ids = await this.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Organization not found');
  }

  /** The form a record belongs to plus the user's access, or 404 when they can't see it at all. */
  async assertRecord(user: UserContext, recordId: string, need: CareFormAccessLevel) {
    const record = await this.prisma.careRecord.findUnique({
      where: { id: recordId },
      include: { form: true, client: { select: { id: true, name: true } } },
    });
    if (!record) throw new NotFoundException('Record not found');
    const level = await this.formAccess(user, record.form);
    if (!level) throw new NotFoundException('Record not found');
    const reach = await this.clientIds(user);
    if (record.clientId) {
      if (reach !== null && !reach.includes(record.clientId)) throw new NotFoundException('Record not found');
    } else if (reach !== null || level !== 'edit') {
      // Pending intake: only for people who reach every organization and can edit intakes.
      throw new NotFoundException('Record not found');
    }
    if (need === 'edit' && level !== 'edit') throw new ForbiddenException("Your role can't edit this form");
    return { record, level };
  }
}
