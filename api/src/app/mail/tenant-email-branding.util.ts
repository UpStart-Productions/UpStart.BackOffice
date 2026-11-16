import { absolutePublicAssetUrl } from '../storage/asset-url.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { EmailTenantBranding } from './email-layout';

/** Tenant logo + display name for team emails (only when a logo is on file). */
export async function loadTenantEmailBranding(
  prisma: PrismaService,
  tenantId: string,
): Promise<EmailTenantBranding | undefined> {
  const [tenant, profile] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.organizationProfile.findUnique({ where: { tenantId }, select: { companyName: true, logoUrl: true } }),
  ]);
  const logoUrl = absolutePublicAssetUrl(profile?.logoUrl ?? null);
  if (!logoUrl) return undefined;
  const name = profile?.companyName?.trim() || tenant?.name?.trim() || '';
  return { name, logoUrl };
}