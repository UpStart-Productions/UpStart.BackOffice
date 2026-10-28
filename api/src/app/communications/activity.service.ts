import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../tenancy/tenant-context';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { ActivityFeedQueryDto, ActivityQueueKey, ActivityQueuesQueryDto, SetNextStepDto, SnoozeDto } from './dto/activity.dto';
import { clampLimit, InteractionRow, listInclude, toInteractionView } from './interactions.service';

const DAY = 24 * 60 * 60 * 1000;
/** Needs reply only looks this far back; older threads are history, not a to-do. */
const REPLY_LOOKBACK_DAYS = 60;

const ownerSelect = { id: true, firstName: true, lastName: true, name: true, email: true, avatarUrl: true } as const;

export type NextStepView = {
  clientId: string;
  text: string | null;
  date: string | null;
  owner: { id: string; firstName: string | null; lastName: string | null; name: string | null; email: string; avatarUrl: string | null } | null;
  overdue: boolean;
};

export type QueueRow = {
  queue: ActivityQueueKey;
  /** Snooze key: thread key (REPLY), organization id or "lead:<id>" (NEXT_STEP), organization id (QUIET). */
  refKey: string;
  clientId: string | null;
  clientName: string | null;
  leadId?: string | null;
  contactId?: string | null;
  person: string | null;
  title: string;
  /** REPLY: when they wrote. NEXT_STEP: due date. QUIET: last contact. */
  at: string | null;
  overdue?: boolean;
  dueToday?: boolean;
  owner?: string | null;
  interactionId?: string | null;
};

function endOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

function personName(u: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email || null;
}

/**
 * Activity: the timeline across organizations and people, the next step on an organization,
 * and the To do queues (Needs reply, Next steps, Gone quiet, Unfiled).
 *
 * Visibility rule: an email or logged activity shows on the organization it is filed to and on the page of every
 * person on it. It never shows on the other organizations those people belong to. Activity on a person that is
 * not filed to any organization shows on each of their organizations when "include people's activity" is on.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Where-clause limiting interactions to what this user may see. */
  private async reach(user: UserContext): Promise<Prisma.InteractionWhereInput> {
    const ids = await this.access.clientIds(user);
    if (ids === null) return {};
    return { OR: [{ clientId: { in: ids } }, { clientId: null, loggedByUserId: user.id }] };
  }

  private async assertClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids && !ids.includes(clientId)) throw new NotFoundException('Organization not found.');
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Organization not found.');
  }

  private async orgContactIds(clientId: string): Promise<string[]> {
    const links = await this.prisma.contactAccount.findMany({ where: { clientId }, select: { contactId: true } });
    return [...new Set(links.map((l) => l.contactId))];
  }

  /** The timeline: one organization, one person, or everything (Activity page). Newest first. */
  async feed(user: UserContext, q: ActivityFeedQueryDto) {
    const limit = clampLimit(q.limit);
    const and: Prisma.InteractionWhereInput[] = [await this.reach(user)];
    let peopleIds: string[] = [];

    if (q.contactId) {
      and.push({ participants: { some: { contactId: q.contactId } } });
    } else {
      // Unfiled mail is a to-do (Activity → To do), not history.
      and.push({ status: 'FILED' });
    }
    if (q.clientId) {
      await this.assertClient(user, q.clientId);
      const includePeople = q.includePeople !== false;
      if (includePeople) {
        peopleIds = await this.orgContactIds(q.clientId);
        and.push({
          OR: [
            { clientId: q.clientId },
            ...(peopleIds.length ? [{ clientId: null, participants: { some: { contactId: { in: peopleIds } } } }] : []),
          ],
        });
      } else {
        and.push({ clientId: q.clientId });
      }
    }
    if (q.type) and.push({ type: q.type });
    if (q.loggedByUserId) and.push({ loggedByUserId: q.loggedByUserId });
    if (q.from || q.to || q.before) {
      const occurredAt: Prisma.DateTimeFilter = {};
      if (q.from) occurredAt.gte = new Date(q.from);
      if (q.to) occurredAt.lte = new Date(q.to);
      if (q.before) occurredAt.lt = new Date(q.before);
      and.push({ occurredAt });
    }
    const text = q.q?.trim();
    if (text) {
      and.push({
        OR: [
          { subject: { contains: text, mode: 'insensitive' } },
          { bodyText: { contains: text, mode: 'insensitive' } },
          { location: { contains: text, mode: 'insensitive' } },
          { participants: { some: { OR: [{ name: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }] } } },
        ],
      });
    }

    const rows = await this.prisma.interaction.findMany({
      where: { AND: and },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      include: listInclude,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit) as unknown as InteractionRow[];
    const people = new Set(peopleIds);
    const items = page.map((r) => {
      const view = toInteractionView(r, false);
      // On an organization's timeline, say whose activity pulled in an item that is not filed to it.
      const via =
        q.clientId && r.clientId !== q.clientId
          ? ((r.participants ?? []) as { contactId: string | null; name: string | null; email: string }[])
              .filter((p) => p.contactId && people.has(p.contactId))
              .map((p) => p.name?.trim() || p.email)
          : [];
      return { ...view, via };
    });
    const last = items[items.length - 1];
    return { items, nextBefore: hasMore && last ? last.occurredAt.toISOString() : null };
  }

  // ---------- Next step ----------

  async nextStep(user: UserContext, clientId: string): Promise<NextStepView> {
    await this.assertClient(user, clientId);
    const c = await this.prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { id: true, nextAction: true, nextActionDate: true, nextActionOwner: { select: ownerSelect } },
    });
    return this.toNextStep(c);
  }

  private toNextStep(c: {
    id: string;
    nextAction: string | null;
    nextActionDate: Date | null;
    nextActionOwner: { id: string; firstName: string | null; lastName: string | null; name: string | null; email: string; avatarUrl: string | null } | null;
  }): NextStepView {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    return {
      clientId: c.id,
      text: c.nextAction,
      date: c.nextActionDate ? c.nextActionDate.toISOString() : null,
      owner: c.nextActionOwner ? { ...c.nextActionOwner, avatarUrl: toPublicAssetUrl(c.nextActionOwner.avatarUrl) } : null,
      overdue: !!c.nextAction && !!c.nextActionDate && c.nextActionDate < startOfToday,
    };
  }

  async setNextStep(user: UserContext, clientId: string, dto: SetNextStepDto): Promise<NextStepView> {
    await this.assertClient(user, clientId);
    const text = dto.text === undefined ? undefined : dto.text?.trim() || null;
    if (dto.ownerId) {
      const owner = await this.prisma.user.findFirst({ where: { id: dto.ownerId, isActive: true }, select: { id: true } });
      if (!owner) throw new BadRequestException('Unknown owner.');
    }
    const c = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(text !== undefined && { nextAction: text }),
        ...(dto.date !== undefined && { nextActionDate: dto.date ? new Date(dto.date) : null }),
        ...(dto.ownerId !== undefined && { nextActionOwnerId: dto.ownerId || null }),
        // Clearing the step clears its date and owner too.
        ...(text === null && { nextActionDate: null, nextActionOwnerId: null }),
      },
      select: { id: true, nextAction: true, nextActionDate: true, nextActionOwner: { select: ownerSelect } },
    });
    return this.toNextStep(c);
  }

  /** Done: the step is recorded on the timeline as a note ("Done: …") and cleared, ready for the next one. */
  async completeNextStep(user: UserContext, clientId: string): Promise<NextStepView> {
    await this.assertClient(user, clientId);
    const c = await this.prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { nextAction: true } });
    if (!c.nextAction?.trim()) throw new BadRequestException('There is no next step to complete.');
    await this.prisma.interaction.create({
      data: {
        type: 'NOTE',
        direction: 'INTERNAL',
        occurredAt: new Date(),
        subject: `Done: ${c.nextAction.trim()}`.slice(0, 300),
        source: 'MANUAL',
        status: 'FILED',
        clientId,
        loggedByUserId: user.id,
        participants: { create: [{ email: user.email.toLowerCase(), role: 'ATTENDEE', userId: user.id }] },
      },
    });
    return this.setNextStep(user, clientId, { text: null });
  }

  // ---------- To do ----------

  async snooze(user: UserContext, dto: SnoozeDto) {
    const until = dto.until ? new Date(dto.until) : null;
    await this.prisma.activitySnooze.upsert({
      where: { tenantId_queue_refKey: { tenantId: currentTenantId(), queue: dto.queue, refKey: dto.refKey } },
      create: { queue: dto.queue, refKey: dto.refKey, until, createdById: user.id },
      update: { until, createdById: user.id, createdAt: new Date() },
    });
    return { ok: true };
  }

  private async thresholds() {
    const p = await this.prisma.organizationProfile.findUnique({
      where: { tenantId: currentTenantId() },
      select: { needsReplyDays: true, goneQuietDays: true },
    });
    return { needsReplyDays: p?.needsReplyDays ?? 2, goneQuietDays: p?.goneQuietDays ?? 30 };
  }

  /**
   * Activity → To do. mine (default): Needs reply on threads I am on; next steps and quiet clients I own or that have
   * no owner. Unfiled is shared triage and is not narrowed by mine. Optional clientId / contactId narrow every queue to that record.
   */
  async queues(user: UserContext, q: ActivityQueuesQueryDto) {
    const mine = q.mine !== false;
    const now = new Date();
    const { needsReplyDays, goneQuietDays } = await this.thresholds();
    const ids = await this.access.clientIds(user);
    const snoozes = await this.prisma.activitySnooze.findMany({
      where: { OR: [{ until: null }, { until: { gt: now } }] },
      select: { queue: true, refKey: true },
    });
    const snoozed = new Set(snoozes.map((s) => `${s.queue}:${s.refKey}`));
    const isSnoozed = (queue: ActivityQueueKey, key: string) => snoozed.has(`${queue}:${key}`);

    let orgPeople: string[] = [];
    if (q.clientId) {
      await this.assertClient(user, q.clientId);
      orgPeople = await this.orgContactIds(q.clientId);
    }
    const reach = await this.reach(user);
    const clientReach: Prisma.ClientWhereInput = ids === null ? {} : { id: { in: ids } };
    const ownerMine: Prisma.ClientWhereInput = mine ? { OR: [{ nextActionOwnerId: user.id }, { nextActionOwnerId: null }] } : {};
    const clientNarrow: Prisma.ClientWhereInput = {
      ...(q.clientId ? { id: q.clientId } : {}),
      ...(q.contactId ? { contactLinks: { some: { contactId: q.contactId } } } : {}),
    };

    // Needs reply: the latest message on a filed email thread came from outside and has waited long enough.
    const emails = await this.prisma.interaction.findMany({
      where: {
        AND: [
          reach,
          { type: 'EMAIL', status: 'FILED', occurredAt: { gte: new Date(now.getTime() - REPLY_LOOKBACK_DAYS * DAY) } },
          q.clientId ? { clientId: q.clientId } : {},
          q.contactId ? { participants: { some: { contactId: q.contactId } } } : {},
        ],
      },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        threadKey: true,
        direction: true,
        occurredAt: true,
        subject: true,
        clientId: true,
        client: { select: { name: true } },
        participants: { select: { role: true, name: true, email: true, contactId: true, userId: true } },
      },
    });
    const threads = new Map<string, typeof emails>();
    for (const e of emails) {
      const key = e.threadKey || e.id;
      const list = threads.get(key);
      if (list) list.push(e);
      else threads.set(key, [e]);
    }
    const replyCutoff = now.getTime() - needsReplyDays * DAY;
    const reply: QueueRow[] = [];
    for (const [key, list] of threads) {
      const latest = list[0];
      if (latest.direction !== 'INBOUND' || latest.occurredAt.getTime() > replyCutoff) continue;
      if (isSnoozed('REPLY', key)) continue;
      if (mine && !list.some((m) => m.participants.some((p) => p.userId === user.id))) continue;
      const from = latest.participants.find((p) => p.role === 'FROM');
      reply.push({
        queue: 'REPLY',
        refKey: key,
        clientId: latest.clientId,
        clientName: latest.client?.name ?? null,
        contactId: from?.contactId ?? null,
        person: from ? from.name?.trim() || from.email : null,
        title: latest.subject?.trim() || '(no subject)',
        at: latest.occurredAt.toISOString(),
        interactionId: latest.id,
      });
    }
    reply.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));

    // Next steps: every next step that is set (organizations and pipeline cards), soonest first; overdue ones flagged.
    // An organization without a next step is fine and is not listed.
    const dueBy = endOfToday(now);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const orgs = await this.prisma.client.findMany({
      where: {
        AND: [clientReach, clientNarrow, ownerMine, { nextAction: { not: null } }],
      },
      select: { id: true, name: true, nextAction: true, nextActionDate: true, nextActionOwner: { select: ownerSelect } },
    });
    const nextStep: QueueRow[] = orgs
      .filter((o) => o.nextAction?.trim() && !isSnoozed('NEXT_STEP', o.id))
      .map((o) => ({
        queue: 'NEXT_STEP' as const,
        refKey: o.id,
        clientId: o.id,
        clientName: o.name,
        person: null,
        title: o.nextAction!.trim(),
        at: o.nextActionDate ? o.nextActionDate.toISOString() : null,
        overdue: !!o.nextActionDate && o.nextActionDate < startOfToday,
        dueToday: !!o.nextActionDate && o.nextActionDate >= startOfToday && o.nextActionDate <= dueBy,
        owner: personName(o.nextActionOwner),
      }));
    if (!q.contactId) {
      const cards = await this.prisma.lead.findMany({
        where: {
          archivedAt: null,
          nextAction: { not: null },
          ...(q.clientId ? { clientId: q.clientId } : {}),
          ...(ids === null ? {} : { clientId: { in: ids } }),
        },
        select: { id: true, organization: true, nextAction: true, nextActionDate: true, clientId: true, client: { select: { name: true } } },
      });
      for (const c of cards) {
        const key = `lead:${c.id}`;
        if (isSnoozed('NEXT_STEP', key)) continue;
        if (!c.nextAction?.trim()) continue;
        nextStep.push({
          queue: 'NEXT_STEP',
          refKey: key,
          clientId: c.clientId,
          clientName: c.client?.name ?? c.organization,
          leadId: c.id,
          person: null,
          title: c.nextAction.trim(),
          at: c.nextActionDate ? c.nextActionDate.toISOString() : null,
          overdue: !!c.nextActionDate && c.nextActionDate < startOfToday,
          dueToday: !!c.nextActionDate && c.nextActionDate >= startOfToday && c.nextActionDate <= dueBy,
          owner: null,
        });
      }
    }
    // Soonest first (overdue at the top); no date last.
    nextStep.sort((a, b) => (a.at ?? '9999').localeCompare(b.at ?? '9999'));

    // Gone quiet: active clients with no contact for a while.
    const quietCutoff = new Date(now.getTime() - goneQuietDays * DAY);
    const quietOrgs = await this.prisma.client.findMany({
      where: {
        AND: [
          clientReach,
          clientNarrow,
          ownerMine,
          { journey: 'CLIENT', isActive: true },
          { OR: [{ lastContactAt: null }, { lastContactAt: { lt: quietCutoff } }] },
        ],
      },
      select: { id: true, name: true, lastContactAt: true, nextActionOwner: { select: ownerSelect } },
      orderBy: { lastContactAt: { sort: 'asc', nulls: 'first' } },
    });
    const quiet: QueueRow[] = quietOrgs
      .filter((o) => !isSnoozed('QUIET', o.id))
      .map((o) => ({
        queue: 'QUIET' as const,
        refKey: o.id,
        clientId: o.id,
        clientName: o.name,
        person: null,
        title: o.lastContactAt ? `No contact in ${Math.floor((now.getTime() - o.lastContactAt.getTime()) / DAY)} days` : 'No contact logged yet',
        at: o.lastContactAt ? o.lastContactAt.toISOString() : null,
        owner: personName(o.nextActionOwner),
      }));

    // Unfiled: captured mail that could not be placed. Shared triage, so Mine does not narrow it;
    // users limited to assigned clients only see mail they captured or are on.
    const unfiledWhere: Prisma.InteractionWhereInput = {
      AND: [
        { status: 'UNFILED' },
        ids === null
          ? {}
          : { OR: [{ captures: { some: { userId: user.id } } }, { participants: { some: { userId: user.id } } }] },
        q.contactId ? { participants: { some: { contactId: q.contactId } } } : {},
        q.clientId ? { participants: { some: { contactId: { in: orgPeople } } } } : {},
      ],
    };
    const unfiledRows = await this.prisma.interaction.findMany({
      where: unfiledWhere,
      orderBy: { occurredAt: 'desc' },
      take: 200,
      include: listInclude,
    });
    const unfiled = (unfiledRows as unknown as InteractionRow[]).map((r) => toInteractionView(r, false));

    return {
      counts: {
        reply: reply.length,
        nextStep: nextStep.length,
        /** Next steps that are overdue or due today (what the nav badge counts). */
        nextStepDue: nextStep.filter((n) => n.overdue || n.dueToday).length,
        quiet: quiet.length,
        unfiled: unfiled.length,
      },
      thresholds: { needsReplyDays, goneQuietDays },
      reply,
      nextStep,
      quiet,
      unfiled,
    };
  }

  /** Nav badge: my Needs reply, next steps overdue or due today, and Unfiled. Gone quiet is a review list, not counted. */
  async count(user: UserContext): Promise<{ count: number }> {
    const r = await this.queues(user, { mine: true });
    return { count: r.counts.reply + r.counts.nextStepDue + r.counts.unfiled };
  }
}
