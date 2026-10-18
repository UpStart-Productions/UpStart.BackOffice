import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

const dup = () => Object.assign(new Error('unique'), { code: 'P2002' });

function make() {
  const prisma = {
    contact: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    contactEmail: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    contactAccount: { upsert: vi.fn(), deleteMany: vi.fn() },
    client: { findUnique: vi.fn() },
  };
  prisma.contact.findFirst.mockResolvedValue({ id: 'k1', emails: [], accountLinks: [] });
  return { prisma, svc: new ContactsService(prisma as never) };
}

describe('ContactsService', () => {
  let h: ReturnType<typeof make>;
  beforeEach(() => { h = make(); });

  it('list builds search, client and review filters', async () => {
    h.prisma.contact.findMany.mockResolvedValue([]);
    await h.svc.list({ q: ' Ann ', clientId: 'c1', review: true });
    const where = h.prisma.contact.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: 'default', autoCreated: true, accountLinks: { some: { clientId: 'c1' } } });
    expect(where.OR).toHaveLength(3);
    expect(where.OR[2]).toEqual({ emails: { some: { email: { contains: 'ann' } } } });
  });

  it('get 404s', async () => {
    h.prisma.contact.findFirst.mockResolvedValue(null);
    await expect(h.svc.get('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create normalizes the email and links the client', async () => {
    h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    h.prisma.contact.create.mockResolvedValue({ id: 'k1' });
    await h.svc.create({ firstName: ' Ann ', email: 'Ann@X.Test', clientId: 'c1', role: 'POA' });
    const data = h.prisma.contact.create.mock.calls[0][0].data;
    expect(data.firstName).toBe('Ann');
    expect(data.emails.create).toEqual({ tenantId: 'default', email: 'ann@x.test', isPrimary: true });
    expect(data.accountLinks.create).toEqual({ clientId: 'c1', role: 'POA' });
  });

  it('create reports duplicate emails as a conflict', async () => {
    h.prisma.contact.create.mockRejectedValue(dup());
    await expect(h.svc.create({ firstName: 'A', email: 'a@x.test' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects an unknown client', async () => {
    h.prisma.client.findUnique.mockResolvedValue(null);
    await expect(h.svc.create({ firstName: 'A', clientId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update only touches provided fields', async () => {
    await h.svc.update('k1', { autoCreated: false, title: 'Director' });
    expect(h.prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'k1' }, data: { title: 'Director', autoCreated: false },
    });
  });

  it('addEmail normalizes, can take over primary, and maps duplicates to conflict', async () => {
    await h.svc.addEmail('k1', { email: 'New@X.test', isPrimary: true });
    expect(h.prisma.contactEmail.updateMany).toHaveBeenCalledWith({ where: { contactId: 'k1' }, data: { isPrimary: false } });
    expect(h.prisma.contactEmail.create).toHaveBeenCalledWith({
      data: { tenantId: 'default', contactId: 'k1', email: 'new@x.test', isPrimary: true },
    });
    h.prisma.contactEmail.create.mockRejectedValue(dup());
    await expect(h.svc.addEmail('k1', { email: 'dup@x.test' })).rejects.toBeInstanceOf(ConflictException);
    await expect(h.svc.addEmail('k1', { email: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links and unlinks accounts', async () => {
    h.prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    await h.svc.linkAccount('k1', { clientId: 'c1', role: 'Case manager' });
    expect(h.prisma.contactAccount.upsert.mock.calls[0][0]).toMatchObject({
      where: { contactId_clientId: { contactId: 'k1', clientId: 'c1' } },
      create: { contactId: 'k1', clientId: 'c1', role: 'Case manager', isPrimary: false },
    });
    await h.svc.unlinkAccount('k1', 'c1');
    expect(h.prisma.contactAccount.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'k1', clientId: 'c1' } });
  });
});
