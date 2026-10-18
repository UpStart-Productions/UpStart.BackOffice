import { describe, expect, it, vi } from 'vitest';

vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { BadRequestException } from '@nestjs/common';
import { captureAddress, CaptureSettingsService, normalizeDomains } from './capture-settings.service';
import { INBOUND_EMAIL_DOMAIN } from './communications.constants';

function make(opts: { aliases?: unknown[]; verifications?: unknown[]; internalDomains?: string[] } = {}) {
  const prisma = {
    tenant: {
      findUnique: vi.fn().mockResolvedValue({ internalDomains: opts.internalDomains ?? ['tpn.test'] }),
      update: vi.fn().mockResolvedValue({}),
    },
    forwardingVerification: { findMany: vi.fn().mockResolvedValue(opts.verifications ?? []) },
  };
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
  it('builds addresses on the product domain', () => {
    expect(captureAddress('tpn')).toBe(`tpn@${INBOUND_EMAIL_DOMAIN}`);
    expect(captureAddress(null)).toBeNull();
  });
  it('normalizes domains and rejects junk', () => {
    expect(normalizeDomains([' @ThePurpleNest.org ', 'www.tpn.org', 'tpn.org', ''])).toEqual(['thepurplenest.org', 'tpn.org']);
    expect(() => normalizeDomains(['not a domain'])).toThrow(BadRequestException);
    expect(() => normalizeDomains(['lori@tpn.org'])).toThrow(BadRequestException);
  });
});

describe('CaptureSettingsService', () => {
  it('reports address, aliases and the tenant team domains', async () => {
    const s = await make().svc.get();
    expect(s.inboundDomain).toBe(INBOUND_EMAIL_DOMAIN);
    expect(s.address).toBe(`tpn@${INBOUND_EMAIL_DOMAIN}`);
    expect(s.aliases).toEqual([
      { alias: 'tpn', isPrimary: true, address: `tpn@${INBOUND_EMAIL_DOMAIN}` },
      { alias: 'old-name', isPrimary: false, address: `old-name@${INBOUND_EMAIL_DOMAIN}` },
    ]);
    expect(s.internalDomains).toEqual(['tpn.test']);
  });

  it('has no address until the tenant has an alias', async () => {
    const s = await make({ aliases: [] }).svc.get();
    expect(s.address).toBeNull();
    expect((await make({ aliases: [] }).svc.address()).address).toBeNull();
  });

  it('scopes verifications to the tenant and only returns Google links', async () => {
    const h = make({
      verifications: [
        { id: 'v1', gmailAddress: 'a@g.test', code: '123456', link: 'https://mail-settings.google.com/mail/vf-x', receivedAt: new Date(), alias: { alias: 'tpn' } },
        { id: 'v2', gmailAddress: 'b@g.test', code: '654321', link: 'https://evil.example/phish', receivedAt: new Date(), alias: { alias: 'tpn' } },
      ],
    });
    const s = await h.svc.get();
    expect(h.prisma.forwardingVerification.findMany.mock.calls[0][0].where).toEqual({ alias: { tenantId: 'default' } });
    expect(s.verifications.map((v) => v.link)).toEqual(['https://mail-settings.google.com/mail/vf-x', null]);
  });

  it('saves normalized team domains on the tenant', async () => {
    const h = make();
    await h.svc.setInternalDomains(['@TPN.org', 'tpn.org']);
    expect(h.prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'default' }, data: { internalDomains: ['tpn.org'] } });
  });

  it('changing the alias delegates and returns fresh settings', async () => {
    const h = make();
    await h.svc.setAlias('New Name');
    expect(h.aliases.setPrimaryAlias).toHaveBeenCalledWith('default', 'New Name');
  });
});
