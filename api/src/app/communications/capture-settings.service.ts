import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from './communications.constants';
import { InboundAliasService } from './inbound-alias.service';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.
const GOOGLE_LINK_PREFIX = 'https://mail-settings.google.com/';

export function captureAddress(alias: string | null, domain: string | null): string | null {
  return alias && domain ? `${alias}@${domain}` : null;
}

export function parseDomainList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export interface CaptureSettings {
  /** From INBOUND_EMAIL_DOMAIN; null until the server is configured. */
  inboundDomain: string | null;
  primaryAlias: string | null;
  /** Full address to forward to, or null when the domain isn't configured. */
  address: string | null;
  aliases: { alias: string; isPrimary: boolean; address: string | null }[];
  internalDomains: string[];
  /** Recent Gmail forwarding confirmations (newest first). */
  verifications: {
    id: string;
    gmailAddress: string | null;
    code: string | null;
    link: string | null;
    receivedAt: Date;
    alias: string;
  }[];
}

@Injectable()
export class CaptureSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: InboundAliasService,
  ) {}

  async get(): Promise<CaptureSettings> {
    const inboundDomain = (process.env.INBOUND_EMAIL_DOMAIN ?? '').trim().toLowerCase() || null;
    const aliasRows = await this.aliases.listForTenant(TENANT);
    const primaryAlias = aliasRows.find((a) => a.isPrimary)?.alias ?? null;

    const verifications = await this.prisma.forwardingVerification.findMany({
      where: { alias: { tenantId: TENANT } },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        gmailAddress: true,
        code: true,
        link: true,
        receivedAt: true,
        alias: { select: { alias: true } },
      },
    });

    return {
      inboundDomain,
      primaryAlias,
      address: captureAddress(primaryAlias, inboundDomain),
      aliases: aliasRows.map((a) => ({
        alias: a.alias,
        isPrimary: a.isPrimary,
        address: captureAddress(a.alias, inboundDomain),
      })),
      internalDomains: parseDomainList(process.env.INTERNAL_EMAIL_DOMAINS),
      verifications: verifications.map((v) => ({
        id: v.id,
        gmailAddress: v.gmailAddress,
        code: v.code,
        // The link comes from an inbound email body, so only ever hand back Google's own host.
        link: v.link && v.link.startsWith(GOOGLE_LINK_PREFIX) ? v.link : null,
        receivedAt: v.receivedAt,
        alias: v.alias.alias,
      })),
    };
  }

  async setAlias(alias: string): Promise<CaptureSettings> {
    await this.aliases.setPrimaryAlias(TENANT, alias);
    return this.get();
  }
}
