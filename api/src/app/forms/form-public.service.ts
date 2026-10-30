import { htmlToPlainText } from '../task-manager/task-mentions.util';
import {
  BadRequestException, ForbiddenException, GoneException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import {
  computeFormScores, normalizeFormSettings, publicSections,
  type FormFieldDto, type FormPublicFormDto, type FormPublicLinkDto, type FormPublicSubmitResultDto, type FormResultDto,
  type FormScores, type FormScoring, type FormSectionDto, type FormSnapshot,
} from '@upstart/back-office/shared';
import { RateLimiter } from '../common/rate-limiter';
import { normalizeEmail } from '../communications/email-address.util';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { FormDestinations, PUBLIC_LINK_INCLUDE, type FormDestination, type PublicLink } from './form-destinations';
import { PasscodeDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './form.dto';
import { mergeFormValues } from './form-fields.util';
import { checkPasscode, formLinkUrl, maskEmail, newAccessToken, newEmailCode, sha256 } from './form-links.util';
import { adminAppBaseUrl } from '../notifications/notification-delivery.service';
import { FormStructureService } from './form-structure.service';

/** Who's asking: their IP (rate limits) and, from a browser, the website (Origin header) the page is on. */
export type PublicRequest = { ip: string; origin: string | undefined };

/** A link with no websites listed works anywhere. UBO's own public page is always allowed. */
function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin || !allowed?.length) return true;
  const o = origin.toLowerCase();
  if (o === new URL(adminAppBaseUrl()).origin.toLowerCase()) return true;
  return allowed.includes(o);
}

const ACCESS_HOURS = 2;
const CODE_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

/**
 * Public form links (no sign-in). The token finds the link and its tenant; the link may require a
 * passcode or an emailed code first, which trades for a short-lived access token (X-Form-Access).
 * The engine checks the answers; the owning module's destination decides where they go.
 */
@Injectable()
export class FormPublicService {
  private readonly viewLimiter = new RateLimiter(60, 10 * 60 * 1000);
  private readonly verifyLimiter = new RateLimiter(10, 15 * 60 * 1000);
  private readonly codeLimiter = new RateLimiter(5, 60 * 60 * 1000);
  private readonly submitLimiter = new RateLimiter(10, 10 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly structure: FormStructureService,
    private readonly destinations: FormDestinations,
  ) {}

  /**
   * Runs fn in the link's tenant with the link loaded; 404/410 for unknown, revoked or expired links, 403 when the
   * request comes from a website the link doesn't allow. (The website check stops other sites from showing the form;
   * requests without an Origin, such as server-to-server calls, aren't website requests and pass.)
   */
  private async withLink<T>(
    req: PublicRequest,
    token: string,
    fn: (link: PublicLink, destination: FormDestination) => Promise<T>,
  ): Promise<T> {
    const ip = req.ip;
    if (!this.viewLimiter.allow(`${ip}`)) throw new HttpException('Too many requests, try again in a few minutes', HttpStatus.TOO_MANY_REQUESTS);
    const found = await runUnscoped(() => this.prisma.formLink.findUnique({ where: { token }, select: { tenantId: true } }));
    if (!found) throw new NotFoundException('This link is not valid');
    return runWithTenant(found.tenantId, async () => {
      const link = await this.prisma.formLink.findUnique({ where: { token }, include: PUBLIC_LINK_INCLUDE });
      if (!link) throw new NotFoundException('This link is not valid');
      const destination = this.destinations.get(link.form.module);
      if (!destination) throw new NotFoundException('This link is not valid');
      if (destination.tenantModule) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id: found.tenantId }, select: { modules: true } });
        if (!tenant?.modules.includes(destination.tenantModule)) throw new NotFoundException('This link is not valid');
      }
      if (link.revokedAt || (link.expiresAt && link.expiresAt < new Date())) {
        throw new GoneException('This link no longer works. Ask the organization that sent it for a new one.');
      }
      if (destination.requiresPublished && !link.form.publishedVersion) throw new NotFoundException('This form is not available right now');
      if (!originAllowed(req.origin, link.allowedOrigins)) throw new ForbiddenException('This form is not available on this website');
      return fn(link, destination);
    });
  }

  /** The verified access for this request (null when the link needs no check). */
  private async access(link: PublicLink, accessToken: string | undefined) {
    if (link.verify === 'NONE') return null;
    if (!accessToken) throw new UnauthorizedException('Verification required');
    const row = await this.prisma.formLinkAccess.findFirst({
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

  /** What the link serves: the published version when there is one, otherwise the live fields. */
  private async content(link: PublicLink): Promise<{ name: string; description: string | null; sections: FormSectionDto[]; scoring: FormScoring | null }> {
    const v = link.form.publishedVersion;
    if (v) {
      const snap = v.snapshot as unknown as FormSnapshot;
      return { name: snap.name, description: snap.description, sections: snap.sections ?? [], scoring: snap.scoring ?? null };
    }
    return { name: link.form.name, description: link.form.description, sections: await this.structure.sections(link.formId), scoring: null };
  }

  info(req: PublicRequest, token: string): Promise<FormPublicLinkDto> {
    return this.withLink(req, token, async (link, destination) => ({
      ...(await this.content(link).then((c) => ({ formName: c.name, ...descriptionParts(c.description) }))),
      organizationName: await this.organizationName(link.tenantId),
      kind: link.kind,
      clientName: link.client?.name ?? null,
      verify: link.verify,
      maskedEmail: link.kind === 'CLIENT' ? maskEmail(link.email) : null,
      ask: destination.ask(link),
      pageUrl: formLinkUrl(link.form.module, link.token),
    }));
  }

  passcode(req: PublicRequest, token: string, dto: PasscodeDto) {
    const ip = req.ip;
    return this.withLink(req, token, async (link) => {
      if (link.verify !== 'PASSCODE') throw new BadRequestException('This link has no passcode');
      if (!this.verifyLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many tries. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
      if (!checkPasscode(dto.passcode.trim(), link.passcodeHash)) throw new UnauthorizedException('That passcode is not right');
      return { accessToken: await this.grant(link.id, null) };
    });
  }

  sendCode(req: PublicRequest, token: string, dto: SendCodeDto) {
    const ip = req.ip;
    return this.withLink(req, token, async (link) => {
      if (link.verify !== 'EMAIL_CODE') throw new BadRequestException('This link does not use emailed codes');
      const email = link.kind === 'CLIENT' ? link.email : normalizeEmail(dto.email);
      if (!email) throw new BadRequestException('Enter your email address');
      if (!this.codeLimiter.allow(`${link.id}:${ip}`) || !this.codeLimiter.allow(`${link.id}:${email}`)) {
        throw new HttpException('Too many codes sent. Wait an hour and try again.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = newEmailCode();
      const row = await this.prisma.formLinkAccess.create({
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

  verifyCode(req: PublicRequest, token: string, dto: VerifyCodeDto) {
    const ip = req.ip;
    return this.withLink(req, token, async (link) => {
      if (!this.verifyLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many tries. Wait 15 minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
      const row = await this.prisma.formLinkAccess.findFirst({ where: { id: dto.challengeId, linkId: link.id } });
      if (!row?.codeHash || !row.email || !row.codeExpiresAt || row.codeExpiresAt < new Date() || row.attempts >= MAX_CODE_ATTEMPTS) {
        throw new UnauthorizedException('That code has expired. Send a new one.');
      }
      if (sha256(`${link.id}:${row.email}:${dto.code.trim()}`) !== row.codeHash) {
        await this.prisma.formLinkAccess.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
        throw new UnauthorizedException('That code is not right');
      }
      const accessToken = newAccessToken();
      await this.prisma.formLinkAccess.update({
        where: { id: row.id },
        data: { codeHash: null, token: sha256(accessToken), tokenExpiresAt: new Date(Date.now() + ACCESS_HOURS * 3_600_000) },
      });
      return { accessToken };
    });
  }

  form(req: PublicRequest, token: string, accessToken: string | undefined): Promise<FormPublicFormDto> {
    return this.withLink(req, token, async (link, destination) => {
      const access = await this.access(link, accessToken);
      const { sections } = await this.content(link);
      const values = link.kind === 'CLIENT' ? await destination.storedValues(link) : {};
      return {
        layout: normalizeFormSettings(link.form.settings).layout,
        sections: publicSections(sections.filter((s) => s.fields.length)),
        values,
        verifiedEmail: access?.email ?? null,
      };
    });
  }

  submit(req: PublicRequest, token: string, accessToken: string | undefined, dto: PublicSubmitDto): Promise<FormPublicSubmitResultDto> {
    const ip = req.ip;
    return this.withLink(req, token, async (link, destination) => {
      if (!this.submitLimiter.allow(`${link.id}:${ip}`)) throw new HttpException('Too many submissions. Try again in a few minutes.', HttpStatus.TOO_MANY_REQUESTS);
      const access = await this.access(link, accessToken);
      const content = await this.content(link);
      const thanks = { ok: true as const, message: `Thanks! ${content.name} was sent to ${await this.organizationName(link.tenantId)}.` };
      if (dto.website?.trim()) return thanks; // honeypot: pretend it worked
      const fields = content.sections.flatMap((s) => s.fields);
      const ask = destination.ask(link);
      const name = dto.submitter?.name?.trim() || null;
      const phone = dto.submitter?.phone?.trim() || null;
      const organization = dto.submitter?.organization?.trim() || null;
      const email = access?.email ?? normalizeEmail(dto.submitter?.email);
      if (link.kind === 'NEW') {
        if (!name) throw new BadRequestException('Your name is required');
        if (!email) throw new BadRequestException('A valid email address is required');
        if (ask.organization && !organization) throw new BadRequestException('Your organization is required');
      }
      const stored = link.kind === 'CLIENT' ? await destination.storedValues(link) : {};
      const values = this.merge(fields, stored, dto.values);
      const scores: FormScores | null = content.scoring?.enabled ? computeFormScores(content.sections, content.scoring, values) : null;
      const outcome = (await destination.submit(link, {
        values, name, email, phone, organization, versionId: link.form.publishedVersion?.id ?? null, scores,
      })) as { message?: string; resultToken?: string } | undefined;
      await this.prisma.formLink.update({ where: { id: link.id }, data: { lastUsedAt: new Date() } });
      return {
        ...thanks,
        ...(outcome?.message ? { message: outcome.message } : {}),
        ...(outcome?.resultToken ? { resultToken: outcome.resultToken } : {}),
      };
    });
  }

  /** A respondent's results (no sign-in: the long random token is the key). */
  async result(token: string, ip: string): Promise<FormResultDto> {
    if (!this.viewLimiter.allow(`${ip}`)) throw new HttpException('Too many requests, try again in a few minutes', HttpStatus.TOO_MANY_REQUESTS);
    const found = await runUnscoped(() => this.prisma.formResponse.findUnique({ where: { resultToken: token }, select: { tenantId: true } }));
    if (!found) throw new NotFoundException('These results are not available');
    return runWithTenant(found.tenantId, async () => {
      const r = await this.prisma.formResponse.findUnique({ where: { resultToken: token }, include: { form: true, version: true } });
      if (!r?.scores || !r.version) throw new NotFoundException('These results are not available');
      const snap = r.version.snapshot as unknown as FormSnapshot;
      const scores = r.scores as unknown as FormScores;
      const bands = [...(snap.scoring?.bands ?? [])].sort((a, b) => a.upTo - b.upTo);
      const index = bands.findIndex((b) => b.id === scores.bandId);
      const band = index >= 0 ? bands[index] : null;
      const settings = normalizeFormSettings(r.form.settings);
      return {
        formName: snap.name,
        organizationName: await this.organizationName(found.tenantId),
        firstName: r.submitterName?.trim().split(/\s+/)[0] || null,
        submitterOrganization: r.submitterOrganization,
        submittedAt: r.createdAt.toISOString(),
        total: scores.total,
        max: scores.max,
        percent: scores.percent,
        band: band
          ? { id: band.id, label: band.label, description: band.description, nextSteps: band.nextSteps, assetUrl: band.assetUrl, assetLabel: band.assetLabel, index }
          : null,
        bands: bands.map((b) => ({ id: b.id, label: b.label })),
        groups: scores.groups,
        cta: settings.cta,
      };
    });
  }

  private merge(fields: FormFieldDto[], stored: Record<string, unknown>, submitted: Record<string, unknown>) {
    try {
      return mergeFormValues(fields, stored, submitted ?? {}, { requireAll: true });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid value');
    }
  }

  private async grant(linkId: string, email: string | null) {
    const accessToken = newAccessToken();
    await this.prisma.formLinkAccess.create({
      data: { linkId, email, token: sha256(accessToken), tokenExpiresAt: new Date(Date.now() + ACCESS_HOURS * 3_600_000) },
    });
    return accessToken;
  }
}

/** A description written in the editor is HTML: send plain text for embeds and the HTML for UBO's own page. */
function descriptionParts(description: string | null): { description: string | null; descriptionHtml: string | null } {
  if (!description?.trim()) return { description: null, descriptionHtml: null };
  if (!/^\s*</.test(description)) return { description, descriptionHtml: null };
  return { description: htmlToPlainText(description, 10000) || null, descriptionHtml: description };
}
