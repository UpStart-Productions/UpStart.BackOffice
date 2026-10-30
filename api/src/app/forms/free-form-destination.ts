import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeFormSettings, type FormScores, type FormSettings, type FormSnapshot } from '@upstart/back-office/shared';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { FormDestinations, type FormDestination, type PublicLink, type PublicSubmission } from './form-destinations';
import { newAccessToken } from './form-links.util';
import { M } from './free-forms.util';

/**
 * Where free-standing forms' submissions go (Forms area). Each submission is kept with its version and
 * scores; with Review on it waits under Waiting for review. Staff are notified, and the respondent can be
 * emailed their results. Scored forms return a result token for the results page.
 */
@Injectable()
export class FreeFormDestination implements FormDestination, OnModuleInit {
  private readonly logger = new Logger(FreeFormDestination.name);
  readonly module = M;
  readonly tenantModule = null;
  readonly requiresPublished = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly destinations: FormDestinations,
    private readonly delivery: NotificationDeliveryService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.destinations.register(this);
  }

  ask(link: PublicLink) {
    const s = normalizeFormSettings(link.form.settings);
    return { organization: s.askOrganization, phone: s.askPhone };
  }

  async storedValues() {
    return {};
  }

  async submit(link: PublicLink, sub: PublicSubmission) {
    const settings = normalizeFormSettings(link.form.settings);
    const resultToken = sub.scores ? newAccessToken() : null;
    const row = await this.prisma.formResponse.create({
      data: {
        formId: link.formId,
        versionId: sub.versionId,
        status: settings.review ? 'PENDING' : 'ACTIVE',
        values: sub.values as Prisma.InputJsonValue,
        scores: sub.scores ? (sub.scores as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        resultToken,
        submitterName: sub.name,
        submitterEmail: sub.email,
        submitterPhone: sub.phone,
        submitterOrganization: sub.organization,
        publicUpdatedAt: new Date(),
        publicUpdatedBy: sub.name,
      },
      select: { id: true },
    });
    const snap = link.form.publishedVersion?.snapshot as unknown as FormSnapshot | undefined;
    const formName = snap?.name ?? link.form.name;
    await this.notifyStaff(link, row.id, formName, sub, settings);
    if (settings.resultsEmail && sub.email) await this.emailRespondent(formName, sub, settings, snap);
    return { message: settings.thankYou ?? undefined, resultToken: resultToken ?? undefined };
  }

  /** Admins, people with Forms: All, and the form's creator. */
  private async notifyStaff(link: PublicLink, responseId: string, formName: string, sub: PublicSubmission, settings: FormSettings) {
    try {
      const users = await this.prisma.user.findMany({
        where: { isActive: true, OR: [{ role: 'ADMIN' }, { role: 'USER' }] },
        select: { id: true, role: true, tenantRole: { select: { permissions: true } } },
      });
      const targets = users.filter((u) => {
        if (u.role === 'ADMIN' || u.id === link.form.createdById) return true;
        const level = (u.tenantRole?.permissions as Record<string, string> | null)?.['forms'];
        return level === 'all';
      });
      const who = [sub.name, sub.organization].filter(Boolean).join(', ') || sub.email || 'Someone';
      await this.delivery.deliverMany(
        targets.map((u) => ({
          userId: u.id,
          type: 'form_submission' as const,
          title: `New ${formName}: ${who}`,
          body: settings.review ? `${who} sent ${formName}. Review it under Forms.` : `${who} sent ${formName}.`,
          meta: { entityType: 'form_response', entityId: responseId, route: ['forms', 'submissions', responseId], actionLabel: 'Open submission' },
        })),
      );
    } catch (err) {
      this.logger.warn(`Form notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async emailRespondent(formName: string, sub: PublicSubmission, settings: FormSettings, snap: FormSnapshot | undefined) {
    try {
      const org = await this.organizationName();
      const firstName = sub.name?.split(/\s+/)[0];
      const scores = sub.scores as FormScores | null;
      const band = scores?.bandId ? snap?.scoring.bands.find((b) => b.id === scores.bandId) : null;
      const parts: string[] = [];
      if (band) {
        if (band.description) parts.push(`<p style="margin:0 0 12px;">${escapeHtml(band.description)}</p>`);
        if (band.nextSteps.length) {
          parts.push('<p style="margin:0 0 6px;font-weight:600;">Recommended next steps</p>');
          parts.push(`<ul style="margin:0 0 12px;padding-left:20px;">${band.nextSteps.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`);
        }
        if (band.assetUrl) {
          parts.push(`<p style="margin:0 0 12px;"><a href="${escapeHtml(band.assetUrl)}">${escapeHtml(band.assetLabel || 'Download your guide')}</a></p>`);
        }
      }
      if (scores?.groups.length) {
        parts.push('<p style="margin:0 0 6px;font-weight:600;">By area</p>');
        parts.push(
          `<table style="border-collapse:collapse;margin:0 0 12px;">${scores.groups
            .map((g) => `<tr><td style="padding:2px 16px 2px 0;">${escapeHtml(g.name)}</td><td style="padding:2px 0;font-weight:600;">${Math.round(g.percent)}%</td></tr>`)
            .join('')}</table>`,
        );
      }
      const html = wrapClientEmail({
        title: scores ? `Your ${formName} results` : `Thanks for sending ${formName}`,
        subtitle: org,
        greeting: firstName ? `Hi ${firstName},` : 'Hi,',
        intro: scores
          ? band
            ? `Your result: ${band.label} (${Math.round(scores.percent)}%).`
            : `Your score: ${Math.round(scores.percent)}%.`
          : settings.thankYou ?? `We received ${formName}. Thank you!`,
        facts: scores ? [{ label: 'Score', value: `${Math.round(scores.percent)}%` }, ...(band ? [{ label: 'Profile', value: band.label }] : [])] : [],
        extraHtml: parts.join(''),
        ...(settings.cta ? { action: { href: settings.cta.url, label: settings.cta.label } } : {}),
      });
      await this.mail.sendRaw({ to: sub.email!, subject: scores ? `Your ${formName} results` : `Thanks for sending ${formName}`, html });
    } catch (err) {
      this.logger.warn(`Results email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async organizationName() {
    const profile = await this.prisma.organizationProfile.findFirst({ select: { companyName: true } });
    return profile?.companyName?.trim() || undefined;
  }
}
