import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeFormSettings, type FormScores, type FormSettings, type FormSnapshot } from '@upstart/back-office/shared';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { FormDestinations, type FormDestination, type PublicDraft, type PublicLink, type PublicSubmission } from './form-destinations';
import { liveValues } from './form-fields.util';
import { FormStructureService } from './form-structure.service';
import { newAccessToken } from './form-links.util';
import { absolutePublicAssetUrl } from '../storage/asset-url.util';
import { M } from './free-forms.util';

/**
 * Where Forms submissions go. New-response links: each submission is kept with its version and scores; with
 * Review on it waits under Waiting for review. Staff are notified, and the respondent can be emailed their results.
 * Scored forms return a result token for the results page. Client links (living client forms): the answers save
 * straight to that client's copy.
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
    private readonly structure: FormStructureService,
  ) {}

  onModuleInit() {
    this.destinations.register(this);
  }

  /** Name and email only: anything else (organization, phone) is a question on the form. */
  ask(_link: PublicLink) {
    return { organization: false, phone: false };
  }

  /** A client link's result: the one it was made for, or (older links) the client's living copy. */
  private async clientTarget(link: PublicLink): Promise<{ id: string; values: unknown; submittedAt: Date | null } | null> {
    if (link.kind !== 'CLIENT' || !link.clientId) return null;
    const select = { id: true, values: true, submittedAt: true } as const;
    if (link.responseId) return this.prisma.formResponse.findFirst({ where: { id: link.responseId, formId: link.formId }, select });
    return this.prisma.formResponse.findFirst({ where: { formId: link.formId, clientId: link.clientId, living: true }, select });
  }

  /** A client link starts from (and merges into) its result. */
  async storedValues(link: PublicLink) {
    const target = await this.clientTarget(link);
    if (!target) return {};
    return liveValues(await this.structure.fields(link.formId), target.values);
  }

  async submittedAt(link: PublicLink) {
    return (await this.clientTarget(link))?.submittedAt ?? null;
  }

  async saveDraft(link: PublicLink, d: PublicDraft, draftId: string | null): Promise<{ id: string }> {
    const now = new Date();
    if (link.kind === 'CLIENT') {
      const who = d.email ?? d.name ?? 'Someone with the link';
      const target = await this.clientTarget(link);
      const data = { values: d.values as Prisma.InputJsonValue, publicUpdatedAt: now, publicUpdatedBy: who };
      if (target) return this.prisma.formResponse.update({ where: { id: target.id }, data, select: { id: true } });
      return this.prisma.formResponse.create({ data: { formId: link.formId, clientId: link.clientId!, living: true, ...data }, select: { id: true } });
    }
    const submitter = {
      submitterName: d.name,
      submitterEmail: d.email,
      submitterPhone: d.phone,
      submitterOrganization: d.organization,
      publicUpdatedAt: now,
      publicUpdatedBy: d.name ?? d.email,
    };
    if (draftId) {
      return this.prisma.formResponse.update({ where: { id: draftId }, data: { values: d.values as Prisma.InputJsonValue, ...submitter }, select: { id: true } });
    }
    // The first answer starts a draft: In progress (not submitted), waiting under Submissions until it's sent.
    return this.prisma.formResponse.create({
      data: { formId: link.formId, versionId: d.versionId, status: 'PENDING', values: d.values as Prisma.InputJsonValue, draftTokenHash: d.tokenHash, ...submitter },
      select: { id: true },
    });
  }

  async submit(link: PublicLink, sub: PublicSubmission, draftId?: string | null) {
    if (link.kind === 'CLIENT') return this.submitClientCopy(link, sub);
    const settings = normalizeFormSettings(link.form.settings);
    const resultToken = sub.scores ? newAccessToken() : null;
    const finished = {
      versionId: sub.versionId,
      status: settings.review ? ('PENDING' as const) : ('ACTIVE' as const),
      values: sub.values as Prisma.InputJsonValue,
      scores: sub.scores ? (sub.scores as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      resultToken,
      submitterName: sub.name,
      submitterEmail: sub.email,
      submitterPhone: sub.phone,
      submitterOrganization: sub.organization,
      publicUpdatedAt: new Date(),
      publicUpdatedBy: sub.name,
      submittedAt: new Date(),
      draftTokenHash: null,
    };
    const row = draftId
      ? await this.prisma.formResponse.update({ where: { id: draftId }, data: finished, select: { id: true } })
      : await this.prisma.formResponse.create({ data: { formId: link.formId, ...finished }, select: { id: true } });
    const snap = link.form.publishedVersion?.snapshot as unknown as FormSnapshot | undefined;
    const formName = snap?.name ?? link.form.name;
    await this.notifyStaff(link, row.id, formName, sub, settings);
    if (settings.resultsEmail && sub.email) await this.emailRespondent(formName, sub, settings, snap);
    return { message: settings.thankYou ?? undefined, resultToken: resultToken ?? undefined, responseId: row.id };
  }

  /** Someone outside (e.g. family) submitted a client's result through its share link. */
  private async submitClientCopy(link: PublicLink, sub: PublicSubmission) {
    const clientId = link.clientId!;
    const who = sub.email ?? sub.name ?? 'Someone with the link';
    const now = new Date();
    const data = { values: sub.values as Prisma.InputJsonValue, publicUpdatedAt: now, publicUpdatedBy: who, submittedAt: now };
    const existing = await this.clientTarget(link);
    const row = existing
      ? await this.prisma.formResponse.update({ where: { id: existing.id }, data, select: { id: true } })
      : await this.prisma.formResponse.create({ data: { formId: link.formId, clientId, living: true, ...data }, select: { id: true } });
    const clientName = link.client?.name ?? 'a client';
    await this.notifyUsers(link, row.id, `${link.form.name} submitted: ${clientName}`, `${who} submitted ${link.form.name} for ${clientName} through a link.`, [
      'forms', 'results', row.id,
    ]);
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

  /** Client-copy updates: admins, the form's creator, people with Forms: All and roles with Edit on the form. */
  private async notifyUsers(link: PublicLink, responseId: string, title: string, body: string, route: string[]) {
    try {
      const editRoles = new Set(Object.entries((link.form.access ?? {}) as Record<string, string>).filter(([, l]) => l === 'edit').map(([id]) => id));
      const users = await this.prisma.user.findMany({
        where: { isActive: true, OR: [{ role: 'ADMIN' }, { role: 'USER' }] },
        select: { id: true, role: true, roleId: true, tenantRole: { select: { permissions: true } } },
      });
      const targets = users.filter((u) => {
        if (u.role === 'ADMIN' || u.id === link.form.createdById) return true;
        if (u.roleId && editRoles.has(u.roleId)) return true;
        return (u.tenantRole?.permissions as Record<string, string> | null)?.['forms'] === 'all';
      });
      await this.delivery.deliverMany(
        targets.map((u) => ({
          userId: u.id,
          type: 'form_submission' as const,
          title,
          body,
          meta: { entityType: 'form_response', entityId: responseId, route, actionLabel: 'Open' },
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
        const assetHref = absolutePublicAssetUrl(band.assetUrl);
        if (assetHref) {
          parts.push(`<p style="margin:0 0 12px;"><a href="${escapeHtml(assetHref)}">${escapeHtml(band.assetLabel || 'Download your guide')}</a></p>`);
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
      // The thank-you message (formatted text, links included): first on a plain thank-you, after the results otherwise.
      if (settings.thankYou) {
        const block = `<div style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2d2d2d;">${settings.thankYou}</div>`;
        if (scores) parts.push(block);
        else parts.unshift(block);
      }
      const html = wrapClientEmail({
        title: scores ? `Your ${formName} results` : `Thanks for sending ${formName}`,
        subtitle: org,
        greeting: firstName ? `Hi ${firstName},` : 'Hi,',
        intro: scores
          ? band
            ? `Your result: ${band.label} (${Math.round(scores.percent)}%).`
            : `Your score: ${Math.round(scores.percent)}%.`
          : settings.thankYou
            ? undefined
            : `We received ${formName}. Thank you!`,
        facts: scores ? [{ label: 'Score', value: `${Math.round(scores.percent)}%` }, ...(band ? [{ label: 'Profile', value: band.label }] : [])] : [],
        extraHtml: parts.join(''),
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
