import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { escapeHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { adminAppBaseUrl } from '../notifications/notification-delivery.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { DEFAULT_TENANT_ID } from './communications.constants';
import { FileInteractionDto, ForwardInteractionDto, LogInteractionDto } from './dto/communications.dto';
import { stripQuotedText } from './quoted-text.util';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.
const SNIPPET_LENGTH = 300;
/** Built-in Guest role key. Kept as a literal so this service does not pull in the shared package. */
const GUEST_ROLE_KEY = 'guest';

export const listInclude = {
  participants: {
    select: {
      email: true,
      name: true,
      role: true,
      contactId: true,
      userId: true,
      contact: { select: { avatarUrl: true } },
      user: { select: { avatarUrl: true } },
    },
    orderBy: { role: 'asc' as const },
  },
  captures: { select: { capturedByEmail: true, userId: true } },
  loggedBy: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true } },
  /** The organization it is filed to, for feeds that span organizations (Activity page). */
  client: { select: { id: true, name: true } },
};

type ParticipantRow = {
  email: string;
  name: string | null;
  role: string;
  contactId: string | null;
  userId: string | null;
  contact?: { avatarUrl: string | null } | null;
  user?: { avatarUrl: string | null } | null;
};

/** Participant with a flat avatarUrl (contact photo, else the team member's). */
function toParticipantView(p: ParticipantRow) {
  const { contact, user, ...rest } = p;
  return { ...rest, avatarUrl: toPublicAssetUrl(contact?.avatarUrl ?? user?.avatarUrl ?? null) };
}

export type InteractionRow = {
  id: string;
  type: string;
  direction: string;
  occurredAt: Date;
  subject: string | null;
  location?: string | null;
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
  client?: { id: string; name: string } | null;
};

/** Visible text, with Quill/HTML tags removed so a formatted note previews as a sentence. */
export function plainText(value: string | null | undefined): string {
  if (!value) return '';
  const stripped = /<\/?[a-z][^>]*>/i.test(value)
    ? value
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
    : value;
  return stripped.replace(/\s+/g, ' ').trim();
}

export function snippetOf(text: string | null | undefined): string | null {
  const flat = plainText(text);
  if (!flat) return null;
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
  const loggedBy = rest.loggedBy as { avatarUrl?: string | null } | null | undefined;
  return {
    ...rest,
    ...(Array.isArray(rest.participants) ? { participants: (rest.participants as ParticipantRow[]).map(toParticipantView) } : {}),
    ...(loggedBy ? { loggedBy: { ...loggedBy, avatarUrl: toPublicAssetUrl(loggedBy.avatarUrl ?? null) } } : {}),
    hasRaw: !!rawKey,
    snippet: snippetOf(body),
    /** New text only. The list includes it so Activity can show the note without a second request. */
    bodyText: body,
    quoted,
    ...(withBody ? { fullText: quoted ? bodyText : null } : {}),
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

const ACTIVITY_KIND: Record<string, string> = { EMAIL: 'Email', CALL: 'Call', MEETING: 'Meeting', NOTE: 'Note' };
const CALL_WAY: Record<string, string> = { INBOUND: 'They called', OUTBOUND: 'We called', INTERNAL: 'Internal' };

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

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

  /** Active staff, not guests or client-portal logins. For the Who was involved list. */
  async team() {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'USER'] },
        NOT: { tenantRole: { key: GUEST_ROLE_KEY } },
      },
      select: { id: true, firstName: true, lastName: true, name: true, email: true, avatarUrl: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }],
    });
    return users.map((u) => ({ ...u, avatarUrl: toPublicAssetUrl(u.avatarUrl) }));
  }

  /** Log a call, meeting or note by hand. */
  /**
   * Log a call, meeting or note by hand, on an organization, a pipeline card, or a person.
   * Logged on a person (contactId only): filed to their organization when they have exactly one; with none or
   * several it stays on the person (no organization) and shows on their page and, via "include people's activity",
   * on each of their organizations.
   */
  async log(dto: LogInteractionDto, user: { id: string; email: string }) {
    if (dto.clientId && dto.leadId) {
      throw new BadRequestException('Provide only one of clientId or leadId.');
    }
    if (!dto.clientId && !dto.leadId && !dto.contactId) {
      throw new BadRequestException('Provide clientId, leadId or contactId.');
    }
    let logClientId: string | null = dto.clientId ?? null;
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new NotFoundException('Client not found.');
    } else if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId as string }, select: { id: true, clientId: true } });
      if (!lead) throw new NotFoundException('Lead not found.');
      logClientId = lead.clientId;
    } else {
      const person = await this.prisma.contact.findFirst({
        where: { id: dto.contactId },
        select: { id: true, accountLinks: { select: { clientId: true } } },
      });
      if (!person) throw new NotFoundException('Contact not found.');
      const orgs = [...new Set(person.accountLinks.map((l) => l.clientId))];
      logClientId = orgs.length === 1 ? orgs[0] : null;
      dto.contactIds = [...new Set([dto.contactId as string, ...(dto.contactIds ?? [])])];
    }
    if (!dto.subject?.trim() && !plainText(dto.bodyText)) {
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

    const userIds = [...new Set(dto.userIds ?? [])].filter((id) => id !== user.id);
    const teammates = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: userIds },
            isActive: true,
            role: { in: ['ADMIN', 'USER'] },
            NOT: { tenantRole: { key: GUEST_ROLE_KEY } },
          },
          select: { id: true, email: true, firstName: true, lastName: true, name: true },
        })
      : [];
    if (teammates.length !== userIds.length) throw new BadRequestException('Unknown teammate in userIds.');

    const created = await this.prisma.interaction.create({
      data: {
        tenantId: TENANT,
        type: dto.type,
        direction: dto.direction ?? (dto.type === 'NOTE' ? 'INTERNAL' : 'OUTBOUND'),
        occurredAt,
        subject: dto.subject?.trim() || null,
        location: dto.type === 'MEETING' ? dto.location?.trim() || null : null,
        bodyText: plainText(dto.bodyText) ? dto.bodyText!.trim() : null,
        source: 'MANUAL',
        status: 'FILED',
        clientId: logClientId,
        leadId: dto.leadId ?? null,
        loggedByUserId: user.id,
        participants: {
          create: [
            { email: user.email.toLowerCase(), role: 'ATTENDEE' as const, userId: user.id },
            ...teammates.map((u) => ({
              email: u.email.toLowerCase(),
              name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email,
              role: 'ATTENDEE' as const,
              userId: u.id,
            })),
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

  /** Email one activity to the people picked. Teammates also get a bell notification. */
  async forward(id: string, dto: ForwardInteractionDto, actor: { id: string; email: string; name?: string | null; firstName?: string | null; lastName?: string | null }) {
    const userIds = [...new Set(dto.userIds ?? [])].filter(Boolean);
    const contactIds = [...new Set(dto.contactIds ?? [])].filter(Boolean);
    if (!userIds.length && !contactIds.length) throw new BadRequestException('Choose at least one person.');

    const row = await this.prisma.interaction.findFirst({
      where: { id, tenantId: TENANT },
      include: listInclude,
    });
    if (!row) throw new NotFoundException('Interaction not found.');

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: userIds },
            isActive: true,
            role: { in: ['ADMIN', 'USER'] },
            NOT: { tenantRole: { key: GUEST_ROLE_KEY } },
          },
          select: { id: true, email: true, firstName: true },
        })
      : [];
    if (users.length !== userIds.length) throw new BadRequestException('One of those teammates is not available.');

    const contacts = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { tenantId: TENANT, id: { in: contactIds }, isActive: true },
          select: { id: true, firstName: true, emails: { select: { email: true, isPrimary: true } } },
        })
      : [];
    if (contacts.length !== contactIds.length) throw new BadRequestException('One of those people is not available.');

    const recipients = new Map<string, { email: string; firstName: string | null }>();
    for (const user of users) {
      const email = user.email.trim();
      if (!email) continue;
      recipients.set(email.toLowerCase(), { email, firstName: user.firstName });
    }
    for (const contact of contacts) {
      const chosen = contact.emails.find((e) => e.isPrimary) ?? contact.emails[0];
      const email = chosen?.email?.trim();
      if (!email) throw new BadRequestException('One of those people has no email address.');
      const key = email.toLowerCase();
      if (!recipients.has(key)) recipients.set(key, { email, firstName: contact.firstName });
    }
    if (!recipients.size) throw new BadRequestException('None of those people have an email address.');

    const view = toInteractionView(row as InteractionRow, true);
    const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(' ').trim() || actor.name?.trim() || actor.email;
    const kind = ACTIVITY_KIND[view.type] ?? 'Activity';
    const title = view.subject?.trim() || kind;
    const when = new Date(view.occurredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const facts = [
      { label: 'When', value: when },
      ...(view.type === 'CALL' && view.direction ? [{ label: 'Who called', value: CALL_WAY[view.direction] ?? view.direction }] : []),
      ...(view.location ? [{ label: 'Where', value: String(view.location) }] : []),
    ];
    const notes = plainText(view.bodyText);
    const route = view.clientId ? ['clients', view.clientId] : view.leadId ? ['pipeline', view.leadId] : undefined;
    const href = route ? `${adminAppBaseUrl()}/${route.join('/')}` : undefined;
    const subject = `Fwd: ${title}`;

    let emailed = 0;
    let failed = 0;
    for (const person of recipients.values()) {
      const html = wrapClientEmail({
        title,
        subtitle: kind,
        greeting: person.firstName ? `Hi ${person.firstName},` : undefined,
        intro: `${actorName} forwarded this activity to you.`,
        facts,
        extraHtml: notes
          ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2d2d2d;white-space:pre-line;">${escapeHtml(notes)}</p>`
          : undefined,
        action: href ? { href, label: 'Open in Back Office' } : undefined,
      });
      try {
        const result = await this.mail.sendRaw({ to: person.email, subject, html });
        if (result.sent) emailed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }

    const notifyIds = users.map((u) => u.id);
    for (const userId of notifyIds) {
      await this.notifications.create({
        userId,
        type: 'activity_forwarded',
        title: `${actorName} forwarded an activity`,
        body: title,
        meta: {
          entityType: 'interaction',
          entityId: id,
          ...(route ? { route } : {}),
          actorUserId: actor.id,
          actorLabel: actorName,
        },
      });
    }

    return { emailed, notified: notifyIds.length, failed };
  }

  async remove(id: string) {
    const existing = await this.prisma.interaction.findFirst({ where: { id, tenantId: TENANT }, select: { id: true } });
    if (!existing) throw new NotFoundException('Interaction not found.');
    await this.prisma.interaction.delete({ where: { id } });
    return { deleted: true };
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
