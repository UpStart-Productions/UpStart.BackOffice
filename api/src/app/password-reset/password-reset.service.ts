import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { CognitoService } from '../cognito/cognito.service';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenancy/tenant-context';

export const RESET_CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const BAD_CODE = 'That code is invalid or has expired. Request a new one.';

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashCode = (email: string, code: string) =>
  createHash('sha256').update(`${email}:${code}`).digest('hex');

/**
 * Password reset without Cognito email: the API generates a 6-digit code, emails it through SES
 * (the same mailer as invites), and on confirm sets the new password with AdminSetUserPassword.
 * Cognito's own forgot-password email is never used.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cognito: CognitoService,
    private readonly mail: MailService,
  ) {}

  /** Always resolves the same way, so it can't be used to find out which emails have accounts. */
  async request(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);

    // Any active user row in any tenant means this email has an account.
    const user = await runUnscoped(() =>
      this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
        select: { firstName: true },
      }),
    );
    if (!user) return;

    const latest = await this.prisma.passwordReset.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    // Only the newest code works.
    await this.prisma.passwordReset.updateMany({ where: { email, usedAt: null }, data: { usedAt: now } });
    await this.prisma.passwordReset.create({
      data: { email, codeHash: hashCode(email, code), expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MINUTES * 60000) },
    });

    const html = wrapClientEmail({
      title: 'Your password reset code',
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hi,',
      intro: 'Use this code to reset your UpStart Back Office password.',
      extraHtml: `<p style="margin:8px 0 16px;font-size:32px;letter-spacing:6px;font-weight:700;color:#2d2d2d;">${escapeHtml(code)}</p>`,
      actionNote: `This code expires in ${RESET_CODE_TTL_MINUTES} minutes and works once. If you didn't ask to reset your password, you can ignore this email; your password hasn't changed.`,
    });
    const result = await this.mail.sendRaw({ to: email, subject: 'Your UpStart password reset code', html });
    if (!result.sent) {
      this.logger.warn(`Reset code email to ${email} not sent (${result.error ?? 'unknown'}).`);
      if (process.env.NODE_ENV !== 'production') this.logger.warn(`Reset code for ${email}: ${code}`);
    }
  }

  async confirm(rawEmail: string, rawCode: string, password: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const code = rawCode.trim();
    if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters.');

    const reset = await this.prisma.passwordReset.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!reset || reset.attempts >= MAX_ATTEMPTS) throw new BadRequestException(BAD_CODE);

    const expected = Buffer.from(reset.codeHash, 'hex');
    const given = Buffer.from(hashCode(email, code), 'hex');
    if (!timingSafeEqual(expected, given)) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException(BAD_CODE);
    }

    try {
      await this.cognito.setPermanentPassword(email, password);
    } catch (err) {
      if (CognitoService.isPasswordPolicyError(err)) {
        throw new BadRequestException(err.message.replace(/^Password does not conform to policy: /, ''));
      }
      throw err;
    }
    await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
  }
}
