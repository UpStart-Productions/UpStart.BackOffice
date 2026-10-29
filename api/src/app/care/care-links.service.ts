import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { CareLinkKind } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { normalizeEmail } from '../communications/email-address.util';
import { PrismaService } from '../prisma/prisma.service';
import { CareAccessService } from './care-access.service';
import { CreateLinkDto } from './care.dto';
import { hashPasscode, LINK_INCLUDE, linkView, newLinkToken } from './care-links.util';

/** Default lifetime of a per-organization link; new-intake links don't expire unless asked. */
const CLIENT_LINK_DAYS = 30;

@Injectable()
export class CareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly care: CareAccessService,
  ) {}

  async list(where: { formId: string; clientId?: string }) {
    const rows = await this.prisma.careFormLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: LINK_INCLUDE,
    });
    return rows.map(linkView);
  }

  async create(
    user: UserContext,
    target: { formId: string; kind: CareLinkKind; clientId: string | null },
    dto: CreateLinkDto,
  ) {
    let email: string | null = null;
    if (dto.verify === 'PASSCODE' && !dto.passcode?.trim()) throw new BadRequestException('Enter a passcode');
    if (dto.verify === 'EMAIL_CODE' && target.kind === 'CLIENT_UPDATE') {
      email = normalizeEmail(dto.email);
      if (!email) throw new BadRequestException('Enter the email address the code goes to');
    }
    const days =
      dto.expiresInDays === undefined
        ? target.kind === 'CLIENT_UPDATE'
          ? CLIENT_LINK_DAYS
          : null
        : dto.expiresInDays || null;
    const row = await this.prisma.careFormLink.create({
      data: {
        formId: target.formId,
        kind: target.kind,
        clientId: target.clientId,
        token: newLinkToken(),
        label: dto.label?.trim() || null,
        verify: dto.verify,
        passcodeHash: dto.verify === 'PASSCODE' ? hashPasscode(dto.passcode!.trim()) : null,
        email,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
        createdById: user.id,
      },
      include: LINK_INCLUDE,
    });
    return linkView(row);
  }

  /** Setup can revoke any link; people who can edit a form can revoke its links for organizations they reach. */
  async revoke(user: UserContext, id: string) {
    const link = await this.prisma.careFormLink.findUnique({ where: { id }, include: { form: true } });
    if (!link) throw new NotFoundException('Link not found');
    if (!this.care.canSetup(user)) {
      const level = await this.care.formAccess(user, link.form);
      if (level !== 'edit' || !link.clientId) throw new ForbiddenException("Your role can't change this link");
      await this.care.assertClient(user, link.clientId);
    }
    const row = await this.prisma.careFormLink.update({
      where: { id },
      data: { revokedAt: link.revokedAt ?? new Date() },
      include: LINK_INCLUDE,
    });
    await this.prisma.careLinkAccess.deleteMany({ where: { linkId: id } });
    return linkView(row);
  }
}
