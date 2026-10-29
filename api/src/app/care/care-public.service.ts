import { BadRequestException, GoneException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CarePublicFormDto, CarePublicLinkDto, FormFieldType } from '@upstart/back-office/shared';
import { RateLimiter } from '../common/rate-limiter';
import { normalizeEmail } from '../communications/email-address.util';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { CareNotifyService } from './care-notify.service';
import { PasscodeDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './care.dto';
import { fieldView } from './care-forms.controller';
import { checkPasscode, maskEmail, newAccessToken, newEmailCode, sha256 } from './care-links.util';
import { liveValues, mergeFormValues } from './form-fields.util';

const ACCESS_HOURS = 2;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

type Link = Prisma.CareFormLinkGetPayload<{ include: { form: true; client: { select: { name: true } } } }>;

/**
 * Public Care links (no sign-in). The token finds the link and its tenant; the link may require a
 * passcode or an emailed code first, which trades for a short-lived access token (X-Care-Access).
 * New-intake links create a pending intake for staff to review; organization links update that
 * organization's copy of the form directly.
 */
@Injectable()
export class CarePublicService {
  private readonly viewLimiter = new RateLimiter(60, 10 * 60 * 1000);
  private readonly verifyLimiter = new RateLimiter(10, 15 * 60 * 1000);
  private readonly codeLimiter = new RateLimiter(5, 60 * 60 * 1000);
  private readonly submitLimiter = new RateLimiter(10, 10 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notify: CareNotifyService,
  ) {}

  /** Runs fn in the link's tenant with the link loaded; 404/410 for unknown, revoked or expired links. */
  private async withLink<T>(token: string, ip: string, fn: (link: Link) => Promise<T>): Promise<T> {
    if (!this.viewLimiter.allow(`${ip}`)) throw new HttpException('Too many requests, try again in a few minutes', HttpStatus.TOO_MANY_REQUESTS);
    const found = await runUnscoped(() => this.prisma.careFormLink.findUnique({ where: { token }, select: { tenantId: true } }));
    if (!found) throw new NotFoundException('This link is not valid');
    return runWithTenant(found.tenantId, async () => {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: found.tenantId }, select: { modules: true } });
      if (!tenant?.modules.includes('care')) throw new NotFoundException('This link is not valid');
      const link = await this.prisma.careFormLink.findUnique({ where: { token }, include: { form: true, client: { select: { name: true } } } });
      if (!link) throw new NotFoundException('This link is not valid');
      if (link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
        throw new GoneException('This link no longer works. Ask the organization that sent it for a new one.');
      }
      return fn(link);
    });
  }

  /** The verified access for this request (null when the link needs no check). */
  private async access(link: Link, accessToken: string | undefined) {
    if (link.verify === 'NONE') return null;
    if (!accessToken) throw new UnauthorizedException('Verification required');
    const row = await this.prisma.careLinkAccess.findFirst({
      where: { linkId: link.id, token: sha256(accessToken), tokenExpiresAt: { gt: new Date() } },
    });
    if (!row) throw new UnauthorizedException('Verification expired. Verify again to continue.');
    return row;
  }

  private async organizationName(tenantId: string) {
    const profile = await this.prisma.organizationProfile.findFirst({ select: { companyName: true } });
    if (profile?.companyName?.trim()) return profile.companyName.trim();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return tenant?.name ?? 'Organization';
  }

  info(token: string, ip: string): Promise<CarePublicLinkDto> {
    return this.withLink(token, ip, async (link) => ({
      formName: link.form.name,
      description: link.form.description,
      organizationName: await this.organizationName(link.tenantId),
      kind: link.kind,
      clientName: link.client?.name ?? null,
      verify: link.verify,
      maskedEmail: link.kind === 'CLIENT_UPDATE' ? maskEmail(link.email) : null,
    }));
  }

  passcode(token: string, ip: string, dto: PasscodeDto) {
    return this.withLink(token, ip, async (link) => {
      if (link.verify !== 'PASSCODE') throw new BadRequestException('This link has no passcode');
      if (!this.verifyLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many tries. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
      if (!checkPasscode(dto.passcode.trim(), link.passcodeHash)) throw new UnauthorizedException('That passcode is not right');
      return { accessToken: await this.grant(link.id, null) };
    });
  }

  sendCode(token: string, ip: string, dto: SendCodeDto) {
    return this.withLink(token, ip, async (link) => {
      if (link.verify !== 'EMAIL_CODE') throw new BadRequestException('This link does not use emailed codes');
      const email = link.kind === 'CLIENT_UPDATE' ? link.email : normalizeEmail(dto.email);
      if (!email) throw new BadRequestException('Enter your email address');
      if (!this.codeLimiter.allow(`${link.id}:${ip}`) || !this.codeLimiter.allow(`${link.id}:${email}`)) {
        throw new HttpException('Too many codes sent. Wait an hour and try again.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = newEmailCode();
      const row = await this.prisma.careLinkAccess.create({
        data: { linkId: link.id, email, codeHash: sha256(`${link.id}:${email}:${code}`), codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) },
        select: { id: true },
      });
      const org = await this.organizationName(link.tenantId);
      const html = wrapClientEmail({
        title: 'Your verification code',
        subtitle: org,
        intro: `Use this code to open ${link.form.name}. It works for ${CODE_MINUTES} minutes.`,
        extraHtml: `<p style="margin:0 0 12px;font-size:28px;letter-spacing:0.2em;font-weight:700;color:#2d2d2d;">${escapeHtml(code)}</p>`,
        closing: "If you didn't ask for this code, you can ignore this email.",
      });
      const sent = await this.mail.sendRaw({ to: email, subject: `${code} is your code for ${link.form.name}`, html });
      if (!sent.sent) throw new HttpException('Could not send the code. Try again later.', HttpStatus.SERVICE_UNAVAILABLE);
      return { challengeId: row.id, maskedEmail: maskEmail(email) };
    });
  }

  verifyCode(token: string, ip: string, dto: VerifyCodeDto) {
    return this.withLink(token, ip, async (link) => {
      if (!this.verifyLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many tries. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
      const row = await this.prisma.careLinkAccess.findFirst({ where: { id: dto.challengeId, linkId: link.id } });
      if (!row?.codeHash || !row.email || !row.codeExpiresAt || row.codeExpiresAt < new Date() || row.attempts >= MAX_CODE_ATTEMPTS) {
        throw new UnauthorizedException('That code has expired. Send a new one.');
      }
      if (sha256(`${link.id}:${row.email}:${dto.code.trim()}`) !== row.codeHash) {
        await this.prisma.careLinkAccess.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        throw new UnauthorizedException('That code is not right');
      }
      const accessToken = newAccessToken();
      await this.prisma.careLinkAccess.update({
        where: { id: row.id },
        data: { codeHash: null, token: sha256(accessToken), tokenExpiresAt: new Date(Date.now() + ACCESS_HOURS * 3_600_000) },
      });
      return { accessToken };
    });
  }

  form(token: string, ip: string, accessToken: string | undefined): Promise<CarePublicFormDto> {
    return this.withLink(token, ip, async (link) => {
      const access = await this.access(link, accessToken);
      const sections = await this.sections(link.formId);
      let values: Record<string, unknown> = {};
      if (link.kind === 'CLIENT_UPDATE' && link.clientId) {
        const record = await this.prisma.careRecord.findFirst({ where: { formId: link.formId, clientId: link.clientId }, select: { values: true } });
        values = liveValues(sections.flatMap((s) => s.fields), record?.values);
      }
      return { sections, values, verifiedEmail: access?.email ?? null };
    });
  }

  submit(token: string, ip: string, accessToken: string | undefined, dto: PublicSubmitDto) {
    return this.withLink(token, ip, async (link) => {
      if (!this.submitLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many submissions. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
      const access = await this.access(link, accessToken);
      const thanks = { ok: true, message: `Thanks! ${link.form.name} was sent to ${await this.organizationName(link.tenantId)}.` };
      if (dto.website?.trim()) return thanks; // honeypot: pretend it worked
      const fields = (await this.sections(link.formId)).flatMap((s) => s.fields);
      const name = dto.submitter?.name?.trim() || null;
      const phone = dto.submitter?.phone?.trim() || null;
      const email = access?.email ?? normalizeEmail(dto.submitter?.email);

      if (link.kind === 'NEW_INTAKE') {
        if (!name) throw new BadRequestException('Your name is required');
        if (!email) throw new BadRequestException('A valid email address is required');
        const values = this.merge(fields, {}, dto.values);
        const record = await this.prisma.careRecord.create({
          data: {
            formId: link.formId, status: 'PENDING', values: values as Prisma.InputJsonValue,
            submitterName: name, submitterEmail: email, submitterPhone: phone,
            publicUpdatedAt: new Date(), publicUpdatedBy: name,
          },
          select: { id: true },
        });
        await this.prisma.careFormLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
        await this.notify.publicSubmission({
          recordId: record.id, formId: link.formId, clientId: null,
          title: `New ${link.form.name}: ${name}`,
          body: `${name} (${email}) sent ${link.form.name} through a public link. Review it under Care → Intake.`,
        });
        return thanks;
      }

      // CLIENT_UPDATE: this organization's living copy.
      const clientId = link.clientId!;
      const existing = await this.prisma.careRecord.findFirst({ where: { formId: link.formId, clientId } });
      const values = this.merge(fields, (existing?.values ?? {}) as Record<string, unknown>, dto.values);
      const who = email ?? name ?? 'Someone with the link';
      const data = { values: values as Prisma.InputJsonValue, publicUpdatedAt: new Date(), publicUpdatedBy: who };
      const record = existing
        ? await this.prisma.careRecord.update({ where: { id: existing.id }, data, select: { id: true } })
        : await this.prisma.careRecord.create({ data: { formId: link.formId, clientId, ...data }, select: { id: true } });
      await this.prisma.careFormLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
      await this.notify.publicSubmission({
        recordId: record.id, formId: link.formId, clientId,
        title: `${link.form.name} updated: ${link.client?.name ?? ''}`.trim(),
        body: `${who} updated ${link.form.name} for ${link.client?.name ?? 'an organization'} through a link.`,
      });
      return thanks;
    });
  }

  private merge(fields: { id: string; name: string; type: FormFieldType; options: unknown; required: boolean }[], stored: Record<string, unknown>, submitted: Record<string, unknown>) {
    try {
      return mergeFormValues(fields, stored, submitted ?? {}, { requireAll: true });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
  }

  private async grant(linkId: string, email: string | null) {
    const accessToken = newAccessToken();
    await this.prisma.careLinkAccess.create({
      data: { linkId, email, token: sha256(accessToken), tokenExpiresAt: new Date(Date.now() + ACCESS_HOURS * 3_600_000) },
    });
    return accessToken;
  }

  private async sections(formId: string) {
    const rows = await this.prisma.careFormSection.findMany({
      where: { formId },
      orderBy: ORDER,
      select: { id: true, name: true, fields: { orderBy: ORDER, select: { id: true, name: true, type: true, options: true, required: true } } },
    });
    return rows.filter((s) => s.fields.length).map((s) => ({ id: s.id, name: s.name, fields: s.fields.map(fieldView) }));
  }
}
