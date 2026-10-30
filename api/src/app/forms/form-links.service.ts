import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { formProfile, normalizeOrigins, type FormLinkKind } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { normalizeEmail } from '../communications/email-address.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLinkDto, UpdateLinkDto } from './form.dto';
import { hashPasscode, LINK_INCLUDE, linkView, newLinkToken } from './form-links.util';

/** Default lifetime of a per-organization link; new-response links don't expire unless asked. */
const CLIENT_LINK_DAYS = 30;

/**
 * Public links of a form: making, listing and revoking them. The form's builder profile decides which
 * kinds of link it can have. Who may do this is the owning module's check.
 */
@Injectable()
export class FormLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(where: { formId: string; clientId?: string }) {
    const rows = await this.prisma.formLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: LINK_INCLUDE,
    });
    return rows.map(linkView);
  }

  async create(
    user: UserContext,
    target: { formId: string; kind: FormLinkKind; clientId: string | null },
    dto: CreateLinkDto,
  ) {
    const form = await this.prisma.form.findUnique({ where: { id: target.formId }, select: { module: true, key: true } });
    if (!form) throw new NotFoundException('Form not found');
    const profile = formProfile(form.module, form.key);
    if (target.kind === 'NEW' && !profile.newLinks) throw new BadRequestException('This form does not take new-response links');
    if (target.kind === 'CLIENT' && !profile.clientLinks) throw new BadRequestException('This form does not take organization links');
    let email: string | null = null;
    if (dto.verify === 'PASSCODE' && !dto.passcode?.trim()) throw new BadRequestException('Enter a passcode');
    if (dto.verify === 'EMAIL_CODE' && target.kind === 'CLIENT') {
      email = normalizeEmail(dto.email);
      if (!email) throw new BadRequestException('Enter the email address the code goes to');
    }
    const days =
      dto.expiresInDays === undefined
        ? target.kind === 'CLIENT'
          ? CLIENT_LINK_DAYS
          : null
        : dto.expiresInDays || null;
    const row = await this.prisma.formLink.create({
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
        allowedOrigins: normalizeOrigins(dto.allowedOrigins ?? []),
        createdById: user.id,
      },
      include: LINK_INCLUDE,
    });
    return linkView(row);
  }

  /** The link with its form, for the caller's permission check. */
  async find(id: string) {
    const link = await this.prisma.formLink.findUnique({ where: { id }, include: { form: true } });
    if (!link) throw new NotFoundException('Link not found');
    return link;
  }

  /** Rename a link or change the websites that may show it. */
  async update(id: string, dto: UpdateLinkDto) {
    await this.find(id);
    const row = await this.prisma.formLink.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
        ...(dto.allowedOrigins !== undefined ? { allowedOrigins: normalizeOrigins(dto.allowedOrigins) } : {}),
      },
      include: LINK_INCLUDE,
    });
    return linkView(row);
  }

  /** Stop a link working and end every verified session on it. */
  async revoke(id: string) {
    const link = await this.find(id);
    const row = await this.prisma.formLink.update({
      where: { id },
      data: { revokedAt: link.revokedAt ?? new Date() },
      include: LINK_INCLUDE,
    });
    await this.prisma.formLinkAccess.deleteMany({ where: { linkId: id } });
    return linkView(row);
  }
}
