import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from './communications.constants';
import { FileInteractionDto, LogInteractionDto } from './dto/communications.dto';
import { stripQuotedText } from './quoted-text.util';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.
const SNIPPET_LENGTH = 300;

const listInclude = {
  participants: {
    select: { email: true, name: true, role: true, contactId: true, userId: true },
    orderBy: { role: 'asc' as const },
  },
  captures: { select: { capturedByEmail: true, userId: true } },
  loggedBy: { select: { id: true, name: true } },
};

type InteractionRow = {
  id: string;
  type: string;
  direction: string;
  occurredAt: Date;
  subject: string | null;
  bodyText: string | null;
  rawKey: string | null;
  source: string;
  status: string;
  clientId: string | null;
  leadId: string | null;
  threadKey: string | null;
  participants?: unknown[];
  captures?: unknown[];
  loggedBy?: unknown;
};

export function snippetOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH)}…` : flat;
}

/**
 * Emails show only their new text; the quoted history of a reply-all chain is already on the
 * timeline as earlier messages. The full text is still available on the single-item view.
 */
export function toInteractionView(row: InteractionRow, withBody: boolean) {
  const { bodyText, rawKey, ...rest } = row;
  const { body, quoted } =
    row.type === 'EMAIL' ? stripQuotedText(bodyText) : { body: bodyText, quoted: false };
  return {
    ...rest,
    hasRaw: !!rawKey,
    snippet: snippetOf(body),
    ...(withBody ? { bodyText: body, fullText: quoted ? bodyText : null } : {}),
  };
}

export function clampLimit(raw: string | number | undefined, fallback = 50, max = 200): number {
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export interface TimelinePage<T> {
  items: T[];
  /** Pass as ?before= to get the next page; null when there is no more. */
  nextBefore: string | null;
}

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Filed interactions for one client (account) or lead, newest first. */
  async timeline(
    target: { clientId: string } | { leadId: string },
    opts: { limit?: string | number; before?: string } = {},
  ): Promise<TimelinePage<ReturnType<typeof toInteractionView>>> {
    const limit = clampLimit(opts.limit);
    const before = opts.before ? new Date(opts.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new BadRequestException('Invalid "before" date.');

    const rows = await this.prisma.interaction.findMany({
      where: {
        tenantId: TENANT,
        status: 'FILED',
        ...target,
        ...(before ? { occurredAt: { lt: before } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      include: listInclude,
    });
    return this.page(rows as InteractionRow[], limit);
  }

  /** Everything involving one contact, filed or not. */
  async contactTimeline(contactId: string, opts: { limit?: string | number; before?: string } = {}) {
    const limit = clampLimit(opts.limit);
    const before = opts.before ? new Date(opts.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new BadRequestException('Invalid "before" date.');
    const rows = await this.prisma.interaction.findMany({
      where: {
        tenantId: TENANT,
        participants: { some: { contactId } },
        ...(before ? { occurredAt: { lt: before } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      include: listInclude,
    });
    return this.page(rows as InteractionRow[], limit);
  }

  /** The Unfiled inbox: mail that could not be placed automatically. */
  async unfiled(opts: { limit?: string | number; before?: string } = {}) {
    const limit = clampLimit(opts.limit);
    const before = opts.before ? new Date(opts.before) : undefined;
    if (before && Number.isNaN(before.getTime())) throw new BadRequestException('Invalid "before" date.');
    const rows = await this.prisma.interaction.findMany({
      where: {
        tenantId: TENANT,
        status: 'UNFILED',
        ...(before ? { occurredAt: { lt: before } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      include: listInclude,
    });
    return this.page(rows as InteractionRow[], limit);
  }

  async unfiledCount(): Promise<{ count: number }> {
    const count = await this.prisma.interaction.count({ where: { tenantId: TENANT, status: 'UNFILED' } });
    return { count };
  }

  async get(id: string) {
    const row = await this.prisma.interaction.findFirst({
      where: { id, tenantId: TENANT },
      include: listInclude,
    });
    if (!row) throw new NotFoundException('Interaction not found.');
    return toInteractionView(row as InteractionRow, true);
  }

  /** Put an interaction on a client's or lead's timeline. */
  async file(id: string, dto: FileInteractionDto) {
    if (!!dto.clientId === !!dto.leadId) {
      throw new BadRequestException('Provide exactly one of clientId or leadId.');
    }
    const existing = await this.prisma.interaction.findFirst({
      where: { id, tenantId: TENANT },
      select: { id: true, threadKey: true, participants: { select: { contactId: true, userId: true } } },
    });
    if (!existing) throw new NotFoundException('Interaction not found.');

    // Filing to a lead also files to the lead's Account, where the shared timeline lives.
    let targetClientId: string | null = dto.clientId ?? null;
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Client not found.');
    } else {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId as string }, select: { id: true, clientId: true } });
      if (!lead) throw new NotFoundException('Lead not found.');
      targetClientId = lead.clientId;
    }

    await this.prisma.interaction.update({
      where: { id },
      data: {
        status: 'FILED',
        clientId: targetClientId,
        leadId: dto.leadId ?? null,
      },
    });

    // The rest of an id-based thread that is still unfiled goes to the same place.
    let threadItemsFiled = 0;
    if (existing.threadKey?.startsWith('mid:')) {
      const res = await this.prisma.interaction.updateMany({
        where: { tenantId: TENANT, threadKey: existing.threadKey, status: 'UNFILED', id: { not: id } },
        data: { status: 'FILED', clientId: targetClientId, leadId: dto.leadId ?? null },
      });
      threadItemsFiled = res.count;
    }

    // Teach the system: outside contacts on this item now belong to the client,
    // so the next message from them files itself.
    let contactsLinked = 0;
    if (targetClientId && dto.learn !== false) {
      const contactIds = [
        ...new Set(
          existing.participants
            .filter((p) => p.contactId && !p.userId)
            .map((p) => p.contactId as string),
        ),
      ];
      if (contactIds.length) {
        const res = await this.prisma.contactAccount.createMany({
          data: contactIds.map((contactId) => ({ contactId, clientId: targetClientId as string })),
          skipDuplicates: true,
        });
        contactsLinked = res.count;
      }
    }
    return {
      id,
      status: 'FILED' as const,
      clientId: targetClientId,
      leadId: dto.leadId ?? null,
      contactsLinked,
      threadItemsFiled,
    };
  }

  async unfile(id: string) {
    const existing = await this.prisma.interaction.findFirst({ where: { id, tenantId: TENANT }, select: { id: true } });
    if (!existing) throw new NotFoundException('Interaction not found.');
    await this.prisma.interaction.update({
      where: { id },
      data: { status: 'UNFILED', clientId: null, leadId: null },
    });
    return { id, status: 'UNFILED' as const };
  }

  /** Log a call, meeting or note by hand. */
  async log(dto: LogInteractionDto, user: { id: string; email: string }) {
    if (!!dto.clientId === !!dto.leadId) {
      throw new BadRequestException('Provide exactly one of clientId or leadId.');
    }
    let logClientId: string | null = dto.clientId ?? null;
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Client not found.');
    } else {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId as string }, select: { id: true, clientId: true } });
      if (!lead) throw new NotFoundException('Lead not found.');
      logClientId = lead.clientId;
    }
    if (!dto.subject?.trim() && !dto.bodyText?.trim()) {
      throw new BadRequestException('Add a subject or some notes.');
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    const contactIds = [...new Set(dto.contactIds ?? [])];
    const contacts = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { tenantId: TENANT, id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, emails: { select: { email: true, isPrimary: true } } },
        })
      : [];
    if (contacts.length !== contactIds.length) throw new BadRequestException('Unknown contact in contactIds.');

    const created = await this.prisma.interaction.create({
      data: {
        tenantId: TENANT,
        type: dto.type,
        direction: dto.direction ?? (dto.type === 'NOTE' ? 'INTERNAL' : 'OUTBOUND'),
        occurredAt,
        subject: dto.subject?.trim() || null,
        bodyText: dto.bodyText?.trim() || null,
        source: 'MANUAL',
        status: 'FILED',
        clientId: logClientId,
        leadId: dto.leadId ?? null,
        loggedByUserId: user.id,
        participants: {
          create: [
            { email: user.email.toLowerCase(), role: 'ATTENDEE' as const, userId: user.id },
            ...contacts.map((c) => {
              const primary = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
              return {
                email: primary?.email ?? '',
                name: [c.firstName, c.lastName].filter(Boolean).join(' '),
                role: 'ATTENDEE' as const,
                contactId: c.id,
              };
            }),
          ],
        },
      },
      include: listInclude,
    });

    if (contacts.length) {
      await this.prisma.contact.updateMany({
        where: { id: { in: contacts.map((c) => c.id) }, OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }] },
        data: { lastContactAt: occurredAt },
      });
    }
    if (dto.leadId) {
      await this.prisma.lead.updateMany({
        where: { id: dto.leadId, OR: [{ lastContactDate: null }, { lastContactDate: { lt: occurredAt } }] },
        data: { lastContactDate: occurredAt },
      });
    }
    if (logClientId) await this.bumpAccountContact(logClientId, occurredAt);
    return toInteractionView(created as InteractionRow, true);
  }

  /** Move "last contacted" forward on an Account and its pipeline items. */
  private async bumpAccountContact(clientId: string, occurredAt: Date) {
    await this.prisma.client.updateMany({
      where: { id: clientId, OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }] },
      data: { lastContactAt: occurredAt },
    });
    await this.prisma.lead.updateMany({
      where: { clientId, OR: [{ lastContactDate: null }, { lastContactDate: { lt: occurredAt } }] },
      data: { lastContactDate: occurredAt },
    });
  }

  private page(rows: InteractionRow[], limit: number): TimelinePage<ReturnType<typeof toInteractionView>> {
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => toInteractionView(r, false));
    const last = items[items.length - 1];
    return { items, nextBefore: hasMore && last ? last.occurredAt.toISOString() : null };
  }
}
