import { BadRequestException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { CognitoService } from '../cognito/cognito.service';
import { UserContext } from '../common/app.types';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { adminAppBaseUrl } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { personName } from '../task-manager/task-people.util';
import { hashInviteToken, INVITE_TTL_DAYS, inviteExpiry, newInviteToken } from './invite-token.util';

const ROLE_LABEL: Record<ProjectMemberRole, string> = { OWNER: 'an owner', EDITOR: 'an editor', COMMENTER: 'a commenter' };

export type InviteLookup = {
  status: 'valid' | 'expired' | 'accepted';
  email: string;
  firstName: string | null;
  lastName: string | null;
  inviterName: string | null;
  projectName: string | null;
  usesPassword: boolean;
};

/**
 * Branded email invitations with a set-your-password link (no Cognito invite email).
 * Accepting sets a permanent Cognito password; the admin app then signs the user in.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cognito: CognitoService,
    private readonly mail: MailService,
  ) {}

  /** True once the user has accepted any invite (or was never invited, e.g. staff). */
  async hasPendingInvite(userId: string): Promise<boolean> {
    const [pending, accepted] = await Promise.all([
      this.prisma.userInvite.count({ where: { userId, acceptedAt: null } }),
      this.prisma.userInvite.count({ where: { userId, acceptedAt: { not: null } } }),
    ]);
    return pending > 0 && accepted === 0;
  }

  /** userIds (of those given) who were invited but have not accepted yet. */
  async pendingUserIds(userIds: string[]): Promise<Set<string>> {
    if (!userIds.length) return new Set();
    const rows = await this.prisma.userInvite.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { acceptedAt: true },
    });
    return new Set(rows.filter((r) => r._count.acceptedAt === 0).map((r) => r.userId));
  }

  /** Create the Cognito user (silently), a fresh token, and email the branded invite. */
  async sendInvite(params: {
    user: { id: string; email: string; firstName: string | null };
    invitedBy: UserContext;
    project: { id: string; name: string };
    role: ProjectMemberRole;
  }): Promise<{ emailed: boolean }> {
    const { user, invitedBy, project, role } = params;
    await this.cognito.createUserSilently(user.email);
    const { token, hash } = newInviteToken();
    await this.prisma.userInvite.create({
      data: {
        userId: user.id,
        invitedById: invitedBy.id,
        projectId: project.id,
        tokenHash: hash,
        expiresAt: inviteExpiry(),
      },
    });
    const link = `${adminAppBaseUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
    const inviter = personName(invitedBy);
    const html = wrapClientEmail({
      title: `${inviter} shared “${project.name}” with you`,
      greeting: user.firstName ? `Hi ${user.firstName},` : 'Hi,',
      intro: `${inviter} invited you to collaborate on ${project.name} in UpStart Tasks as ${ROLE_LABEL[role]}. Click below to set your password and open the project.`,
      action: { href: link, label: 'Accept invitation' },
      actionNote: `This link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this, you can ignore this email.`,
      extraHtml: `<p style="margin:16px 0 0;font-size:12px;color:#8a8a8a;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(link)}</p>`,
    });
    if (process.env.INVITE_EMAILS === 'log') {
      this.logger.log(`Invite link for ${user.email}: ${link}`);
      return { emailed: false };
    }
    const result = await this.mail.sendRaw({
      to: user.email,
      subject: `${inviter} shared “${project.name}” with you`,
      html,
    });
    if (!result.sent) this.logger.warn(`Invite email to ${user.email} failed: ${result.error}`);
    return { emailed: result.sent };
  }

  async lookup(token: string): Promise<InviteLookup> {
    const invite = await this.prisma.userInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        invitedBy: { select: { email: true, firstName: true, lastName: true, name: true } },
      },
    });
    if (!invite) throw new NotFoundException('This invitation link is not valid.');
    const project = invite.projectId
      ? await this.prisma.project.findUnique({ where: { id: invite.projectId }, select: { name: true } })
      : null;
    const status = invite.acceptedAt ? 'accepted' : invite.expiresAt < new Date() ? 'expired' : 'valid';
    return {
      status,
      email: invite.user.email,
      firstName: invite.user.firstName,
      lastName: invite.user.lastName,
      inviterName: invite.invitedBy ? personName(invite.invitedBy) : null,
      projectName: project?.name ?? null,
      usesPassword: this.cognito.isConfigured,
    };
  }

  /** Set name + password, mark every pending invite for this user accepted. Returns the email to sign in with. */
  async accept(token: string, body: { firstName?: string; lastName?: string; password?: string }) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { user: { select: { id: true, email: true, isActive: true } } },
    });
    if (!invite) throw new NotFoundException('This invitation link is not valid.');
    if (invite.acceptedAt) throw new GoneException('This invitation was already accepted. Sign in instead.');
    if (invite.expiresAt < new Date()) throw new GoneException('This invitation has expired. Ask for a new one.');
    if (!invite.user.isActive) throw new BadRequestException('This account is disabled.');

    if (this.cognito.isConfigured) {
      const password = body.password ?? '';
      if (password.length < 8) throw new BadRequestException('Password must be at least 8 characters.');
      try {
        await this.cognito.setPermanentPassword(invite.user.email, password);
      } catch (err) {
        if (CognitoService.isPasswordPolicyError(err)) throw new BadRequestException(err.message.replace(/^Password does not conform to policy: /, ''));
        throw err;
      }
    }

    const firstName = body.firstName?.trim();
    const lastName = body.lastName?.trim();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: invite.user.id },
        data: {
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        },
      }),
      this.prisma.userInvite.updateMany({ where: { userId: invite.user.id, acceptedAt: null }, data: { acceptedAt: now } }),
    ]);
    return { email: invite.user.email, projectId: invite.projectId };
  }
}
