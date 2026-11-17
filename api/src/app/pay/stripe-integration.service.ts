import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { decryptSecret, encryptSecret } from '../asana/asana-crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../tenancy/tenant-context';
import { UpdateStripeConfigDto } from './dto/update-stripe-config.dto';

export type StripeStatusDto = {
  configured: boolean;
  connectedAt: string | null;
};

export type StripeConfigDto = {
  publishableKey: string;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  configured: boolean;
};

function apiPublicBase(): string {
  const base = process.env.API_BASE_URL?.trim().replace(/\/$/, '') ?? '';
  if (base) return base;
  const port = process.env.PORT?.trim() || '3001';
  return `http://localhost:${port}/api`;
}

@Injectable()
export class StripeIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<StripeStatusDto> {
    const row = await this.ensureRow();
    const configured = this.rowConfigured(row);
    return {
      configured,
      connectedAt: configured ? row.connectedAt?.toISOString() ?? row.updatedAt.toISOString() : null,
    };
  }

  async getConfig(): Promise<StripeConfigDto> {
    const row = await this.ensureRow();
    const slug = await this.tenantSlug();
    return {
      publishableKey: row.publishableKey ?? '',
      hasSecretKey: !!row.secretKeyEnc,
      hasWebhookSecret: !!row.webhookSecretEnc,
      webhookUrl: `${apiPublicBase()}/pay/webhook/${slug}`,
      configured: this.rowConfigured(row),
    };
  }

  async saveConfig(dto: UpdateStripeConfigDto): Promise<StripeConfigDto> {
    const row = await this.ensureRow();
    const publishableKey = dto.publishableKey?.trim() ?? row.publishableKey ?? '';
    if (!publishableKey) {
      throw new BadRequestException('Publishable key is required');
    }
    if (!dto.secretKey?.trim() && !row.secretKeyEnc) {
      throw new BadRequestException('Secret key is required');
    }
    if (!dto.webhookSecret?.trim() && !row.webhookSecretEnc) {
      throw new BadRequestException('Webhook signing secret is required');
    }

    const now = new Date();
    const data: {
      publishableKey: string;
      secretKeyEnc?: string;
      webhookSecretEnc?: string;
      connectedAt: Date;
    } = {
      publishableKey,
      connectedAt: row.connectedAt ?? now,
    };
    if (dto.secretKey?.trim()) {
      data.secretKeyEnc = encryptSecret(dto.secretKey.trim());
    }
    if (dto.webhookSecret?.trim()) {
      data.webhookSecretEnc = encryptSecret(dto.webhookSecret.trim());
    }

    await this.prisma.stripeIntegration.update({
      where: { tenantId: currentTenantId() },
      data,
    });
    return this.getConfig();
  }

  async disconnect(): Promise<StripeStatusDto> {
    await this.prisma.stripeIntegration.deleteMany({ where: { tenantId: currentTenantId() } });
    return { configured: false, connectedAt: null };
  }

  async isConfigured(tenantId?: string): Promise<boolean> {
    const tid = tenantId ?? currentTenantId();
    const row = await this.prisma.stripeIntegration.findUnique({ where: { tenantId: tid } });
    return !!row && this.rowConfigured(row);
  }

  async publishableKey(tenantId?: string): Promise<string | null> {
    const tid = tenantId ?? currentTenantId();
    const row = await this.prisma.stripeIntegration.findUnique({ where: { tenantId: tid } });
    const key = row?.publishableKey?.trim();
    return key || null;
  }

  async getSecretKey(tenantId?: string): Promise<string> {
    const tid = tenantId ?? currentTenantId();
    const row = await this.prisma.stripeIntegration.findUnique({ where: { tenantId: tid } });
    if (!row?.secretKeyEnc) {
      throw new Error('Stripe secret key is not configured for this tenant');
    }
    return decryptSecret(row.secretKeyEnc);
  }

  async getWebhookSecret(tenantId?: string): Promise<string> {
    const tid = tenantId ?? currentTenantId();
    const row = await this.prisma.stripeIntegration.findUnique({ where: { tenantId: tid } });
    if (!row?.webhookSecretEnc) {
      throw new Error('Stripe webhook secret is not configured for this tenant');
    }
    return decryptSecret(row.webhookSecretEnc);
  }

  async testConnection(): Promise<{ ok: true; livemode: boolean }> {
    const secret = await this.getSecretKey();
    const stripe = new Stripe(secret);
    const balance = await stripe.balance.retrieve();
    return { ok: true, livemode: balance.livemode };
  }

  private rowConfigured(row: {
    publishableKey: string | null;
    secretKeyEnc: string | null;
    webhookSecretEnc: string | null;
  }): boolean {
    return !!(row.publishableKey?.trim() && row.secretKeyEnc && row.webhookSecretEnc);
  }

  private async ensureRow() {
    const tenantId = currentTenantId();
    return this.prisma.stripeIntegration.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  private async tenantSlug(): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: currentTenantId() },
      select: { slug: true },
    });
    return tenant?.slug ?? 'unknown';
  }
}