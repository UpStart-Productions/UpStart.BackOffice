import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID, INBOUND_EMAIL_DOMAIN } from './communications.constants';
import { InboundAliasService } from './inbound-alias.service';

const TENANT = DEFAULT_TENANT_ID; // Phase 2 replaces this with the caller's tenant.
const GOOGLE_LINK_PREFIX = 'https://mail-settings.google.com/';
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function captureAddress(alias: string | null): string | null {
  return alias ? `${alias}@${INBOUND_EMAIL_DOMAIN}` : null;
}

/** Lowercase, strip a leading "@" or "www.", drop duplicates. Throws on anything that isn't a domain. */
export function normalizeDomains(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const domain = raw.trim().toLowerCase().replace(/^@/, '').replace(/^www\./, '');
    if (!domain) continue;
    if (!DOMAIN_RE.test(domain)) throw new BadRequestException(`"${raw.trim()}" is not a domain.`);
    if (!out.includes(domain)) out.push(domain);
  }
  return out;
}

export interface CaptureSettings {
  inboundDomain: string;
  primaryAlias: string | null;
  /** Full address to CC, or null when the tenant has no alias yet. */
  address: string | null;
  aliases: { alias: string; isPrimary: boolean; address: string | null }[];
  /** Domains that count as the tenant's own team (besides the tenant's users). */
  internalDomains: string[];
  /** Recent Gmail forwarding confirmations (newest first). Unused in the CC model, kept for setups that forward. */
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
    const aliasRows = await this.aliases.listForTenant(TENANT);
    const primaryAlias = aliasRows.find((a) => a.isPrimary)?.alias ?? null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: TENANT },
      select: { internalDomains: true },
    });
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
      inboundDomain: INBOUND_EMAIL_DOMAIN,
      primaryAlias,
      address: captureAddress(primaryAlias),
      aliases: aliasRows.map((a) => ({ alias: a.alias, isPrimary: a.isPrimary, address: captureAddress(a.alias) })),
      internalDomains: tenant?.internalDomains ?? [],
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

  /** Just the address, for any user (the Email button needs it). */
  async address(): Promise<{ address: string | null }> {
    const primary = (await this.aliases.listForTenant(TENANT)).find((a) => a.isPrimary)?.alias ?? null;
    return { address: captureAddress(primary) };
  }

  async setAlias(alias: string): Promise<CaptureSettings> {
    await this.aliases.setPrimaryAlias(TENANT, alias);
    return this.get();
  }

  async setInternalDomains(domains: string[]): Promise<CaptureSettings> {
    await this.prisma.tenant.update({
      where: { id: TENANT },
      data: { internalDomains: normalizeDomains(domains) },
    });
    return this.get();
  }
}
