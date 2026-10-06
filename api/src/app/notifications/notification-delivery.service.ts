import { Injectable, Logger } from '@nestjs/common';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationInput } from './notification.types';
import { NotificationsService } from './notifications.service';

export function adminAppBaseUrl(): string {
  const explicit = process.env.ADMIN_BASE_URL?.trim() || process.env.ADMIN_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const apiBase = process.env.API_BASE_URL?.trim();
  if (apiBase) return apiBase.replace(/\/api\/?$/, '').replace(/\/$/, '');
  return 'http://localhost:4201';
}

/** Creates the in-app notification, then emails it if the user's preference allows. */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  async deliver(input: CreateNotificationInput): Promise<void> {
    await this.notifications.create(input);
    if (process.env.TASK_EMAIL_NOTIFICATIONS === 'off') return;

    try {
      const prefs = await this.notifications.getEmailPreferences(input.userId);
      if (!prefs[input.type]) return;
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, isActive: true, firstName: true },
      });
      if (!user?.email || !user.isActive) return;

      const route = (input.meta?.route ?? []).filter(Boolean).join('/').replace(/^\/+/, '');
      const href = route ? `${adminAppBaseUrl()}/${route}` : adminAppBaseUrl();
      const html = wrapClientEmail({
        title: input.title,
        subtitle: input.meta?.projectName ? String(input.meta.projectName) : undefined,
        greeting: user.firstName ? `Hi ${user.firstName},` : undefined,
        extraHtml: input.body
          ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2d2d2d;white-space:pre-line;">${escapeHtml(input.body)}</p>`
          : undefined,
        action: { href, label: 'Open task' },
        actionNote: 'Change which emails you get under Inbox → Settings.',
      });
      await this.mail.sendRaw({ to: user.email, subject: input.title, html });
    } catch (err) {
      this.logger.warn(`Notification email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async deliverMany(inputs: CreateNotificationInput[]): Promise<void> {
    for (const input of inputs) await this.deliver(input);
  }
}
