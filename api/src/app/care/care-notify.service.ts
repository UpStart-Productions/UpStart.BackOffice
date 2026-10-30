import { Injectable, Logger } from '@nestjs/common';
import { sanitizePermissions } from '@upstart/back-office/shared';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeFormAccess } from '../forms/form-access.util';

/**
 * Tells staff when something comes in through a public link (bell + email per their preferences).
 * Who: admins, plus people whose role can edit the form and who reach the organization
 * (any organization for a pending intake, which needs Organizations = All).
 */
@Injectable()
export class CareNotifyService {
  private readonly logger = new Logger(CareNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async publicSubmission(params: { recordId: string; formId: string; clientId: string | null; title: string; body: string }) {
    try {
      const form = await this.prisma.form.findUnique({ where: { id: params.formId }, select: { access: true } });
      const editRoles = new Set(
        Object.entries(sanitizeFormAccess(form?.access)).filter(([, l]) => l === 'edit').map(([roleId]) => roleId),
      );
      const users = await this.prisma.user.findMany({
        where: { isActive: true, OR: [{ role: 'ADMIN' }, { role: 'USER', roleId: { in: [...editRoles] } }] },
        select: { id: true, role: true, tenantRole: { select: { permissions: true } }, clientAssignments: { select: { clientId: true } } },
      });
      const targets = users.filter((u) => {
        if (u.role === 'ADMIN') return true;
        const perms = sanitizePermissions(u.tenantRole?.permissions);
        if (!perms.care) return false;
        if (perms.clients === 'all') return true;
        return !!params.clientId && u.clientAssignments.some((a) => a.clientId === params.clientId);
      });
      await this.delivery.deliverMany(
        targets.map((u) => ({
          userId: u.id,
          type: 'care_form_submission' as const,
          title: params.title,
          body: params.body,
          meta: { entityType: 'care_record', entityId: params.recordId, route: ['care', 'records', params.recordId], actionLabel: 'Open form' },
        })),
      );
    } catch (err) {
      this.logger.warn(`Care notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
