import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InteractionsService, clampLimit, snippetOf } from './interactions.service';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const row = (id: string, d: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'EMAIL', direction: 'INBOUND', occurredAt: day(d), subject: `s${id}`,
  bodyText: 'hello   world\n\nbody', rawKey: 'k', source: 'FORWARD', status: 'FILED',
  clientId: 'c1', leadId: null, threadKey: null, participants: [], captures: [], loggedBy: null, ...extra,
});

function make() {
  const prisma = {
    interaction: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    client: { findUnique: vi.fn(), updateMany: vi.fn() },
    lead: { findUnique: vi.fn(), updateMany: vi.fn() },
    contact: { findMany: vi.fn(), updateMany: vi.fn() },
    contactAccount: { createMany: vi.fn() },
  };
  return { prisma, svc: new InteractionsService(prisma as never) };
}

describe('helpers', () => {
  it('clamps limits', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit('abc')).toBe(50);
    expect(clampLimit('0')).toBe(50);
    expect(clampLimit('9999')).toBe(200);
    expect(clampLimit('25')).toBe(25);
  });
  it('makes one-line snippets', () => {
    expect(snippetOf('a  b\n c')).toBe('a b c');
    expect(snippetOf(null)).toBeNull();
    expect(snippetOf('x'.repeat(400))).toHaveLength(301);
    expect(snippetOf('<p>Hello <strong>there</strong></p><p>Next</p>')).toBe('Hello there Next');
    expect(snippetOf('<p><br></p>')).toBeNull();
  });
});

describe('InteractionsService', () => {
  let h: ReturnType<typeof make>;
  beforeEach(() => { h = make(); });

  it('timeline returns a page and a cursor when there is more', async () => {
    h.prisma.interaction.findMany.mockResolvedValue([row('a', 5), row('b', 4), row('c', 3)]);
    const page = await h.svc.timeline({ clientId: 'c1' }, { limit: 2 });
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(page.nextBefore).toBe(day(4).toISOString());
    const args = h.prisma.interaction.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: 'default', status: 'FILED', clientId: 'c1' });
    expect(args.take).toBe(3);
    expect(page.items[0]).not.toHaveProperty('bodyText');
    expect(page.items[0].snippet).toBe('hello world body');
    expect(page.items[0]).not.toHaveProperty('rawKey');
    expect(page.items[0].hasRaw).toBe(true);
  });

  it('timeline has no cursor on the last page and applies "before"', async () => {
    h.prisma.interaction.findMany.mockResolvedValue([row('a', 5)]);
    const page = await h.svc.timeline({ leadId: 'l1' }, { limit: 2, before: day(9).toISOString() });
    expect(page.nextBefore).toBeNull();
    expect(h.prisma.interaction.findMany.mock.calls[0][0].where.occurredAt).toEqual({ lt: day(9) });
  });

  it('rejects a bad "before"', async () => {
    await expect(h.svc.unfiled({ before: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('get returns the full body and 404s when missing', async () => {
    h.prisma.interaction.findFirst.mockResolvedValueOnce(row('a', 1));
    expect(await h.svc.get('a')).toHaveProperty('bodyText', 'hello   world\n\nbody');
    h.prisma.interaction.findFirst.mockResolvedValueOnce(null);
    await expect(h.svc.get('zz')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('file', () => {
    it('requires exactly one target', async () => {
      await expect(h.svc.file('a', {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.svc.file('a', { clientId: 'c', leadId: 'l' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('files to a client and links outside contacts, skipping staff', async () => {
      h.prisma.interaction.findFirst.mockResolvedValue({
        id: 'a',
        participants: [
          { contactId: 'k1', userId: null }, { contactId: 'k1', userId: null },
          { contactId: null, userId: 'u1' }, { contactId: 'k2', userId: null },
        ],
      });
      h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
      h.prisma.contactAccount.createMany.mockResolvedValue({ count: 2 });
      const res = await h.svc.file('a', { clientId: 'c1' });
      expect(h.prisma.interaction.update).toHaveBeenCalledWith({
        where: { id: 'a' }, data: { status: 'FILED', clientId: 'c1', leadId: null },
      });
      expect(h.prisma.contactAccount.createMany).toHaveBeenCalledWith({
        data: [{ contactId: 'k1', clientId: 'c1' }, { contactId: 'k2', clientId: 'c1' }],
        skipDuplicates: true,
      });
      expect(res.contactsLinked).toBe(2);
    });

    it('learn:false skips linking; lead filing never links', async () => {
      h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a', participants: [{ contactId: 'k1', userId: null }] });
      h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
      await h.svc.file('a', { clientId: 'c1', learn: false });
      h.prisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
      await h.svc.file('a', { leadId: 'l1' });
      expect(h.prisma.contactAccount.createMany).not.toHaveBeenCalled();
    });

    it('filing to a lead files to its Account too and teaches the contacts', async () => {
      h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a', participants: [{ contactId: 'k1', userId: null }] });
      h.prisma.lead.findUnique.mockResolvedValue({ id: 'l1', clientId: 'acct1' });
      h.prisma.contactAccount.createMany.mockResolvedValue({ count: 1 });
      const res = await h.svc.file('a', { leadId: 'l1' });
      expect(h.prisma.interaction.update).toHaveBeenCalledWith({
        where: { id: 'a' }, data: { status: 'FILED', clientId: 'acct1', leadId: 'l1' },
      });
      expect(h.prisma.contactAccount.createMany).toHaveBeenCalledWith({
        data: [{ contactId: 'k1', clientId: 'acct1' }],
        skipDuplicates: true,
      });
      expect(res.clientId).toBe('acct1');
    });

    it('404s for unknown interaction, client or lead', async () => {
      h.prisma.interaction.findFirst.mockResolvedValueOnce(null);
      await expect(h.svc.file('a', { clientId: 'c1' })).rejects.toBeInstanceOf(NotFoundException);
      h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a', participants: [] });
      h.prisma.client.findUnique.mockResolvedValue(null);
      await expect(h.svc.file('a', { clientId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
      h.prisma.lead.findUnique.mockResolvedValue(null);
      await expect(h.svc.file('a', { leadId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
      expect(h.prisma.interaction.update).not.toHaveBeenCalled();
    });
  });

  it('shows only the new text of an email, with the full text on the detail view', async () => {
    const quoted = 'Friday works.\n\nOn Tue, Oct 13, 2026 at 10:30 AM Lori <l@x.test> wrote:\n> old schedule';
    h.prisma.interaction.findMany.mockResolvedValue([row('a', 5, { bodyText: quoted })]);
    const page = await h.svc.timeline({ clientId: 'c1' });
    expect(page.items[0].snippet).toBe('Friday works.');
    h.prisma.interaction.findFirst.mockResolvedValue(row('a', 5, { bodyText: quoted }));
    const one = await h.svc.get('a');
    expect(one).toMatchObject({ bodyText: 'Friday works.', fullText: quoted });
    h.prisma.interaction.findFirst.mockResolvedValue(row('n', 5, { type: 'NOTE', bodyText: quoted }));
    expect(await h.svc.get('n')).toMatchObject({ bodyText: quoted, fullText: null });
  });

  it('filing one message files the rest of its unfiled thread', async () => {
    h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a', threadKey: 'mid:root@x', participants: [] });
    h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    h.prisma.interaction.updateMany.mockResolvedValue({ count: 2 });
    const res = await h.svc.file('a', { clientId: 'c1' });
    expect(h.prisma.interaction.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'default', threadKey: 'mid:root@x', status: 'UNFILED', id: { not: 'a' } },
      data: { status: 'FILED', clientId: 'c1', leadId: null },
    });
    expect(res.threadItemsFiled).toBe(2);
  });

  it('never files by a subject-only thread', async () => {
    h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a', threadKey: 'subj:hello', participants: [] });
    h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    const res = await h.svc.file('a', { clientId: 'c1' });
    expect(h.prisma.interaction.updateMany).not.toHaveBeenCalled();
    expect(res.threadItemsFiled).toBe(0);
  });

  it('unfile clears the links', async () => {
    h.prisma.interaction.findFirst.mockResolvedValue({ id: 'a' });
    await h.svc.unfile('a');
    expect(h.prisma.interaction.update).toHaveBeenCalledWith({
      where: { id: 'a' }, data: { status: 'UNFILED', clientId: null, leadId: null },
    });
  });

  describe('log', () => {
    const user = { id: 'u1', email: 'Jeff@Example.com' };

    it('needs a target and some content', async () => {
      await expect(h.svc.log({ type: 'NOTE', bodyText: 'x' }, user)).rejects.toBeInstanceOf(BadRequestException);
      h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
      await expect(h.svc.log({ type: 'CALL', clientId: 'c1' }, user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('logs a call with contacts as attendees and bumps last-contact', async () => {
      h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
      h.prisma.contact.findMany.mockResolvedValue([
        { id: 'k1', firstName: 'Ann', lastName: 'Lee', emails: [{ email: 'ann@x.test', isPrimary: true }] },
      ]);
      h.prisma.interaction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...row('new', 1), ...data, participants: [], captures: [], loggedBy: null,
      }));
      const when = '2026-10-10T15:00:00.000Z';
      await h.svc.log({ type: 'CALL', clientId: 'c1', subject: 'Intake call', occurredAt: when, contactIds: ['k1'] }, user);
      const data = h.prisma.interaction.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: 'default', type: 'CALL', direction: 'OUTBOUND', source: 'MANUAL', status: 'FILED',
        clientId: 'c1', loggedByUserId: 'u1', occurredAt: new Date(when),
      });
      expect(data.participants.create).toEqual([
        { email: 'jeff@example.com', role: 'ATTENDEE', userId: 'u1' },
        { email: 'ann@x.test', name: 'Ann Lee', role: 'ATTENDEE', contactId: 'k1' },
      ]);
      expect(h.prisma.contact.updateMany).toHaveBeenCalled();
    });

    it('logging to a lead also files to the lead\'s Account and bumps its last contact', async () => {
      h.prisma.lead.findUnique.mockResolvedValue({ id: 'l1', clientId: 'acct1' });
      h.prisma.interaction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row('n', 1), ...data }));
      await h.svc.log({ type: 'CALL', leadId: 'l1', subject: 'Intro' }, user);
      expect(h.prisma.interaction.create.mock.calls[0][0].data).toMatchObject({ clientId: 'acct1', leadId: 'l1' });
      expect(h.prisma.client.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'acct1' }) }),
      );
      expect(h.prisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ clientId: 'acct1' }) }),
      );
    });

    it('notes default to INTERNAL; lead notes bump lastContactDate; unknown contacts rejected', async () => {
      h.prisma.lead.findUnique.mockResolvedValue({ id: 'l1' });
      h.prisma.interaction.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...row('n', 1), ...data }));
      await h.svc.log({ type: 'NOTE', leadId: 'l1', bodyText: 'followed up' }, user);
      expect(h.prisma.interaction.create.mock.calls[0][0].data.direction).toBe('INTERNAL');
      expect(h.prisma.lead.updateMany).toHaveBeenCalled();
      h.prisma.contact.findMany.mockResolvedValue([]);
      await expect(h.svc.log({ type: 'NOTE', leadId: 'l1', bodyText: 'x', contactIds: ['ghost'] }, user))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('participant avatars', () => {
  it('flattens a contact photo (else the team member photo) onto each participant', async () => {
    const { toInteractionView } = await import('./interactions.service');
    const view = toInteractionView(
      {
        id: 'i', type: 'EMAIL', direction: 'INBOUND', occurredAt: new Date(), subject: null, bodyText: null, rawKey: null,
        source: 'CC', status: 'FILED', clientId: null, leadId: null, threadKey: null,
        participants: [
          { email: 'a@x', name: 'A', role: 'FROM', contactId: 'c', userId: null, contact: { avatarUrl: '/api/uploads/a.png' }, user: null },
          { email: 'b@x', name: 'B', role: 'TO', contactId: null, userId: 'u', contact: null, user: { avatarUrl: '/api/uploads/b.png' } },
          { email: 'c@x', name: null, role: 'CC', contactId: null, userId: null },
        ],
        loggedBy: { id: 'u', name: 'B', avatarUrl: '/api/uploads/b.png' },
      } as never,
      false,
    ) as { participants: { avatarUrl: string | null; contact?: unknown }[]; loggedBy: { avatarUrl: string } };
    expect(view.participants.map((p) => p.avatarUrl)).toEqual(['/api/uploads/a.png', '/api/uploads/b.png', null]);
    expect(view.participants[0].contact).toBeUndefined();
    expect(view.loggedBy.avatarUrl).toBe('/api/uploads/b.png');
  });
});
