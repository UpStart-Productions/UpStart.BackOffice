import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { captureAddress, CaptureSettingsService, parseDomainList } from './capture-settings.service';

function make(opts: { aliases?: unknown[]; verifications?: unknown[] } = {}) {
  const prisma = { forwardingVerification: { findMany: vi.fn().mockResolvedValue(opts.verifications ?? []) } };
  const aliases = {
    listForTenant: vi.fn().mockResolvedValue(
      opts.aliases ?? [
        { alias: 'tpn', isPrimary: true },
        { alias: 'old-name', isPrimary: false },
      ],
    ),
    setPrimaryAlias: vi.fn().mockResolvedValue({ alias: 'new' }),
  };
  return { prisma, aliases, svc: new CaptureSettingsService(prisma as never, aliases as never) };
}

describe('helpers', () => {
  it('builds addresses only when both parts exist', () => {
    expect(captureAddress('tpn', 'in.example.test')).toBe('tpn@in.example.test');
    expect(captureAddress('tpn', null)).toBeNull();
    expect(captureAddress(null, 'in.example.test')).toBeNull();
  });
  it('parses domain lists', () => {
    expect(parseDomainList(' A.com, b.org ,,')).toEqual(['a.com', 'b.org']);
    expect(parseDomainList(undefined)).toEqual([]);
  });
});

describe('CaptureSettingsService', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.INBOUND_EMAIL_DOMAIN = ' IN.Example.Test ';
    process.env.INTERNAL_EMAIL_DOMAINS = 'tpn.test, Upstart.test';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reports addresses, aliases and team domains', async () => {
    const h = make();
    const s = await h.svc.get();
    expect(s.inboundDomain).toBe('in.example.test');
    expect(s.address).toBe('tpn@in.example.test');
    expect(s.aliases).toEqual([
      { alias: 'tpn', isPrimary: true, address: 'tpn@in.example.test' },
      { alias: 'old-name', isPrimary: false, address: 'old-name@in.example.test' },
    ]);
    expect(s.internalDomains).toEqual(['tpn.test', 'upstart.test']);
  });

  it('has no address until the server domain is configured', async () => {
    delete process.env.INBOUND_EMAIL_DOMAIN;
    const s = await make().svc.get();
    expect(s.inboundDomain).toBeNull();
    expect(s.address).toBeNull();
    expect(s.primaryAlias).toBe('tpn');
  });

  it('scopes verifications to the tenant and only returns Google links', async () => {
    const h = make({
      verifications: [
        { id: 'v1', gmailAddress: 'a@g.test', code: '123456', link: 'https://mail-settings.google.com/mail/vf-x', receivedAt: new Date(), alias: { alias: 'tpn' } },
        { id: 'v2', gmailAddress: 'b@g.test', code: '654321', link: 'https://evil.example/phish', receivedAt: new Date(), alias: { alias: 'tpn' } },
      ],
    });
    const s = await h.svc.get();
    expect(h.prisma.forwardingVerification.findMany.mock.calls[0][0]).toMatchObject({
      where: { alias: { tenantId: 'default' } },
      orderBy: { receivedAt: 'desc' },
      take: 5,
    });
    expect(s.verifications[0].link).toBe('https://mail-settings.google.com/mail/vf-x');
    expect(s.verifications[1].link).toBeNull();
    expect(s.verifications[1].code).toBe('654321');
  });

  it('changing the alias delegates and returns fresh settings', async () => {
    const h = make();
    const s = await h.svc.setAlias('New Name');
    expect(h.aliases.setPrimaryAlias).toHaveBeenCalledWith('default', 'New Name');
    expect(s.address).toBe('tpn@in.example.test');
  });
});
