import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { SUPPORT_FEEDBACK_TOPIC_LABELS } from '@upstart/back-office/shared';
import type { UserContext } from '../common/app.types';
import { escapeHtml } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { tryTenantId } from '../tenancy/tenant-context';
import type { SubmitSupportFeedbackDto } from './dto/support-feedback.dto';
import { summarizeBrowser } from './support-browser.util';

/** Where "Contact Support" requests from the help drawer go. */
export const SUPPORT_INBOX_EMAIL = 'support@heyupstart.com';

function displayName(user: UserContext): string {
  const full = [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ');
  return full || user.name?.trim() || user.email;
}

/** Header-safe single line (no CR/LF). */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async submit(params: {
    user: UserContext;
    dto: SubmitSupportFeedbackDto;
    userAgent?: string;
    impersonatedBy?: { id: string; email: string };
  }): Promise<{ sent: true }> {
    const { user, dto } = params;
    const tenantId = tryTenantId() ?? user.tenantId ?? null;
    const tenant = tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
      : null;
    const tenantName = tenant?.name ?? 'Unknown tenant';
    const name = displayName(user);
    const ua = params.userAgent ?? '';
    const browser = summarizeBrowser(ua);
    const topics = dto.topicIds.map((t) => SUPPORT_FEEDBACK_TOPIC_LABELS[t] ?? t).join(', ');
    const message = dto.message.trim();

    const row = (label: string, value: string) =>
      `<tr><td style="padding:6px 16px 6px 0;vertical-align:top;font-size:13px;color:#6b6b6b;white-space:nowrap;">${escapeHtml(label)}</td>` +
      `<td style="padding:6px 0;font-size:14px;color:#2d2d2d;">${value}</td></tr>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px 32px;">
  <h1 style="margin:0 0 4px;font-size:22px;color:#2d2d2d;">Back Office support request</h1>
  <p style="margin:0 0 20px;font-size:14px;color:#6b6b6b;">${escapeHtml(tenantName)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
    ${row('From', `${escapeHtml(name)} &lt;<a href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a>&gt;`)}
    ${params.impersonatedBy ? row('Impersonated by', escapeHtml(params.impersonatedBy.email)) : ''}
    ${row('Role', escapeHtml(user.isSuper ? 'Super user' : user.role))}
    ${row('Topics', escapeHtml(topics))}
    ${row('Page', `<a href="${escapeHtml(dto.clientEnvironment.href)}">${escapeHtml(dto.clientEnvironment.href)}</a>`)}
    ${row('Browser', escapeHtml(`${browser.family} ${browser.version}`.trim()))}
  </table>
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;font-weight:700;">Message</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${escapeHtml(message)}</p>
  <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;font-weight:700;">Environment</p>
  <pre style="margin:0 0 12px;padding:12px;background:#f9fafb;border-radius:6px;font-size:12px;line-height:1.45;white-space:pre-wrap;">${escapeHtml(JSON.stringify(dto.clientEnvironment, null, 2))}</pre>
  <p style="margin:0;font-size:12px;color:#8a8a8a;white-space:pre-wrap;">User-Agent: ${escapeHtml(ua || '(none)')}</p>
</div></body></html>`;

    const result = await this.mail.sendRaw({
      to: SUPPORT_INBOX_EMAIL,
      subject: oneLine(`Support: ${topics} (${tenantName}, ${name})`),
      html,
      replyTo: oneLine(user.email),
    });
    if (!result.sent) {
      this.logger.warn(`Support request from ${user.email} not sent (${result.error ?? 'unknown'})`);
      throw new BadGatewayException(
        `We couldn't send your message right now. Please email ${SUPPORT_INBOX_EMAIL} directly.`,
      );
    }
    return { sent: true };
  }
}
