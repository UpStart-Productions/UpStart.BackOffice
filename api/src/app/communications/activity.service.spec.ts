import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
vi.mock('../tenancy/tenant-context', () => ({ currentTenantId: () => 't1' }));

import { NotFoundException } from '@nestjs/common';
import { ActivityService } from './activity.service';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const admin = { id: 'u1', email: 'me@x.org', role: 'ADMIN' } as never;

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: 'EMAIL', direction: 'INBOUND', occurredAt: ago(1), subject: id, bodyText: 'hi', rawKey: null,
  source: 'CC', status: 'FILED', clientId: 'orgA', leadId: null, threadKey: null, participants: [], captures: [],
  loggedBy: null, client: null, ...extra,
});

function make(clientIds: string[] | null = null) {
  const prisma = {
    interaction: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    contactAccount: { findMany: vi.fn().mockResolvedValue([{ contactId: 'p1' }, { contactId: 'p2' }]) },
    client: {
      findUnique: vi.fn().mockResolvedValue({ id: 'orgA' }),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    lead: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findFirst: vi.fn() },
    activitySnooze: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    organizationProfile: { findUnique: vi.fn().mockResolvedValue({ needsReplyDays: 2, goneQuietDays: 30 }) },
  };
  const access = { clientIds: vi.fn().mockResolvedValue(clientIds) };
  return { prisma, access, svc: new ActivityService(prisma as never, access as never) };
}

describe('ActivityService.feed — visibility rules', () => {
  let h: ReturnType<typeof make>;
  beforeEach(() => { h = make(); });

  it('organization: filed to it, or its people\'s activity filed to no organization — never filed elsewhere', async () => {
    await h.svc.feed(admin, { clientId: 'orgA' });
    const where = h.prisma.interaction.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ status: 'FILED' });
    expect(where.AND).toContainEqual({
      OR: [{ clientId: 'orgA' }, { clientId: null, participants: { some: { contactId: { in: ['p1', 'p2'] } } } }],
    });
    // Nothing in the filter lets an item filed to another organization through.
    expect(JSON.stringify(where)).not.toContain('orgB');
  });

  it('organization with people turned off: only what is filed to it', async () => {
    await h.svc.feed(admin, { clientId: 'orgA', includePeople: false });
    const where = h.prisma.interaction.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ clientId: 'orgA' });
    expect(h.prisma.contactAccount.findMany).not.toHaveBeenCalled();
  });

  it('labels items pulled in from a person', async () => {
    h.prisma.interaction.findMany.mockResolvedValue([
      row('mine'),
      row('fromPerson', { clientId: null, type: 'CALL', participants: [{ contactId: 'p2', name: 'Sam Patel', email: 's@x.org', role: 'ATTENDEE', userId: null }] }),
    ]);
    const page = await h.svc.feed(admin, { clientId: 'orgA' });
    expect(page.items[0].via).toEqual([]);
    expect(page.items[1].via).toEqual(['Sam Patel']);
  });

  it('person: everything they took part in, filed or not', async () => {
    await h.svc.feed(admin, { contactId: 'p1' });
    const where = h.prisma.interaction.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ participants: { some: { contactId: 'p1' } } });
    expect(where.AND).not.toContainEqual({ status: 'FILED' });
  });

  it('users limited to assigned clients only reach those, plus what they logged themselves', async () => {
    h = make(['orgA']);
    await h.svc.feed(admin, {});
    const where = h.prisma.interaction.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ OR: [{ clientId: { in: ['orgA'] } }, { clientId: null, loggedByUserId: 'u1' }] });
    await expect(h.svc.feed(admin, { clientId: 'orgB' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ActivityService.queues', () => {
  let h: ReturnType<typeof make>;
  beforeEach(() => { h = make(); });

  const email = (id: string, thread: string, direction: string, days: number, me = true) => ({
    id, threadKey: thread, direction, occurredAt: ago(days), subject: id, clientId: 'orgA', client: { name: 'Org A' },
    participants: [
      { role: 'FROM', name: 'Maria', email: 'm@x.org', contactId: 'p1', userId: null },
      ...(me ? [{ role: 'TO', name: 'Me', email: 'me@x.org', contactId: null, userId: 'u1' }] : []),
    ],
  });

  it('Needs reply: latest message is theirs and has waited past the threshold', async () => {
    h.prisma.interaction.findMany
      .mockResolvedValueOnce([
        email('t1-new', 't1', 'INBOUND', 3), email('t1-old', 't1', 'OUTBOUND', 5), // waiting 3 days → listed
        email('t2-new', 't2', 'OUTBOUND', 3), email('t2-old', 't2', 'INBOUND', 5), // we replied → not listed
        email('t3', 't3', 'INBOUND', 1), // too recent → not listed
      ])
      .mockResolvedValueOnce([]);
    const r = await h.svc.queues(admin, {});
    expect(r.reply.map((x) => x.refKey)).toEqual(['t1']);
    expect(r.reply[0].person).toBe('Maria');
  });

  it('snoozed rows are hidden', async () => {
    h.prisma.activitySnooze.findMany.mockResolvedValue([{ queue: 'REPLY', refKey: 't1' }]);
    h.prisma.interaction.findMany.mockResolvedValueOnce([email('t1-new', 't1', 'INBOUND', 3)]).mockResolvedValueOnce([]);
    const r = await h.svc.queues(admin, {});
    expect(r.reply).toEqual([]);
  });

  it('Mine: Needs reply only on threads I am on', async () => {
    h.prisma.interaction.findMany.mockResolvedValueOnce([email('x', 't9', 'INBOUND', 4, false)]).mockResolvedValueOnce([]);
    expect((await h.svc.queues(admin, { mine: true })).reply).toEqual([]);
    h.prisma.interaction.findMany.mockResolvedValueOnce([email('x', 't9', 'INBOUND', 4, false)]).mockResolvedValueOnce([]);
    expect((await h.svc.queues(admin, { mine: false })).reply).toHaveLength(1);
  });

  it('Next steps: only ones that are set, soonest first, overdue flagged', async () => {
    const later = new Date(Date.now() + 5 * DAY);
    h.prisma.client.findMany
      .mockResolvedValueOnce([
        { id: 'o3', name: 'Later', nextAction: 'Check in', nextActionDate: later, nextActionOwner: null },
        { id: 'o1', name: 'Late', nextAction: 'Call', nextActionDate: ago(2), nextActionOwner: null },
        { id: 'o4', name: 'Undated', nextAction: 'Someday', nextActionDate: null, nextActionOwner: null },
      ])
      .mockResolvedValueOnce([]);
    const r = await h.svc.queues(admin, {});
    expect(r.nextStep.map((x) => [x.refKey, x.overdue])).toEqual([['o1', true], ['o3', false], ['o4', false]]);
    expect(r.counts.nextStepDue).toBe(1);
    const where = h.prisma.client.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ nextAction: { not: null } });
  });
});

describe('ActivityService next step', () => {
  it('Done records a note on the timeline and clears the step', async () => {
    const h = make();
    h.prisma.client.findUniqueOrThrow.mockResolvedValue({ nextAction: 'Send proposal' });
    h.prisma.client.update.mockResolvedValue({ id: 'orgA', nextAction: null, nextActionDate: null, nextActionOwner: null });
    const res = await h.svc.completeNextStep(admin, 'orgA');
    const data = h.prisma.interaction.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'NOTE', subject: 'Done: Send proposal', clientId: 'orgA', status: 'FILED' });
    expect(h.prisma.client.update.mock.calls[0][0].data).toMatchObject({ nextAction: null, nextActionDate: null, nextActionOwnerId: null });
    expect(res.text).toBeNull();
  });
});
