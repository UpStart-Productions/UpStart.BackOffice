import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { currentTenantId } from '../tenancy/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { ImageResizeService } from '../storage/image-resize.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { UploadLogoDto } from './dto/upload-logo.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';

const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export type OrganizationProfileDto = {
  companyName: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  /** Where invoices billed to the organization are sent by default. */
  billingEmail: string;
  /** Reimbursement per mile for Mileage expenses; null when not set. */
  mileageRate: number | null;
};

export type OrganizationBrandingDto = {
  companyName: string;
  logoUrl: string | null;
};

@Injectable()
export class OrganizationProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly imageResize: ImageResizeService,
  ) {}

  async get(): Promise<OrganizationProfileDto> {
    const row = await this.ensureProfileRow();
    return this.toDto(row);
  }

  async getBranding(): Promise<OrganizationBrandingDto> {
    const row = await this.ensureProfileRow();
    return {
      companyName: row?.companyName?.trim() ?? '',
      logoUrl: toPublicAssetUrl(row?.logoUrl ?? null),
    };
  }

  /** First visit: seed Business settings company name from the tenant record. */
  private async ensureProfileRow() {
    const tenantId = currentTenantId();
    const existing = await this.prisma.organizationProfile.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const companyName = tenant?.name?.trim();
    if (!companyName) return null;

    return this.prisma.organizationProfile.upsert({
      where: { tenantId },
      create: { companyName },
      update: {},
    });
  }

  async save(dto: UpdateOrganizationProfileDto): Promise<OrganizationProfileDto> {
    const data = {
      companyName: trimToNull(dto.companyName),
      address: trimToNull(dto.address),
      city: trimToNull(dto.city),
      state: trimToNull(dto.state),
      zip: trimToNull(dto.zip),
      phone: trimToNull(dto.phone),
      billingEmail: trimToNull(dto.billingEmail),
      ...(dto.mileageRate !== undefined && { mileageRate: dto.mileageRate }),
    };
    const row = await this.prisma.organizationProfile.upsert({
      where: { tenantId: currentTenantId() },
      create: { ...data },
      update: data,
    });
    return this.toDto(row);
  }

  async getActivitySettings(): Promise<{ needsReplyDays: number; goneQuietDays: number }> {
    const row = await this.prisma.organizationProfile.findUnique({
      where: { tenantId: currentTenantId() },
      select: { needsReplyDays: true, goneQuietDays: true },
    });
    return { needsReplyDays: row?.needsReplyDays ?? 2, goneQuietDays: row?.goneQuietDays ?? 30 };
  }

  async saveActivitySettings(dto: UpdateActivitySettingsDto): Promise<{ needsReplyDays: number; goneQuietDays: number }> {
    const data = {
      ...(dto.needsReplyDays !== undefined && { needsReplyDays: dto.needsReplyDays }),
      ...(dto.goneQuietDays !== undefined && { goneQuietDays: dto.goneQuietDays }),
    };
    const row = await this.prisma.organizationProfile.upsert({
      where: { tenantId: currentTenantId() },
      create: { ...data },
      update: data,
      select: { needsReplyDays: true, goneQuietDays: true },
    });
    return row;
  }

  async uploadLogo(dto: UploadLogoDto): Promise<{ logoUrl: string }> {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.fileBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid image data');
    }
    if (!buffer.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (buffer.length > LOGO_MAX_BYTES) {
      throw new BadRequestException('Image must be less than 5MB');
    }
    if (!ALLOWED_LOGO_MIMES.includes(dto.mimeType)) {
      throw new BadRequestException('Invalid file type. Allowed: PNG, JPEG, GIF, WebP');
    }

    const tenantId = currentTenantId();
    const existing = await this.prisma.organizationProfile.findUnique({
      where: { tenantId },
      select: { logoUrl: true },
    });

    const processed = await this.imageResize.process(buffer, dto.mimeType, 'logo');
    const filename = `logo-${Date.now()}${processed.ext}`;
    const key = `tenants/${tenantId}/branding/${filename}`;
    const storedUrl = await this.storage.upload({
      buffer: processed.buffer,
      key,
      mimeType: processed.mimeType,
    });

    if (existing?.logoUrl) {
      await this.deleteStoredLogo(existing.logoUrl);
    }

    const row = await this.prisma.organizationProfile.upsert({
      where: { tenantId },
      create: { logoUrl: storedUrl },
      update: { logoUrl: storedUrl },
    });

    const logoUrl = toPublicAssetUrl(row.logoUrl) ?? storedUrl;
    return { logoUrl };
  }

  async removeLogo(): Promise<OrganizationProfileDto> {
    const tenantId = currentTenantId();
    const existing = await this.prisma.organizationProfile.findUnique({
      where: { tenantId },
    });
    if (existing?.logoUrl) {
      await this.deleteStoredLogo(existing.logoUrl);
    }
    const row = await this.prisma.organizationProfile.upsert({
      where: { tenantId },
      create: { logoUrl: null },
      update: { logoUrl: null },
    });
    return this.toDto(row);
  }

  private async deleteStoredLogo(logoUrl: string): Promise<void> {
    try {
      const key = this.storage.keyFromUrl(logoUrl);
      if (key && !key.startsWith('http')) {
        await this.storage.delete(key);
      }
    } catch {
      /* best-effort cleanup */
    }
  }

  private toDto(row: {
    companyName?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone?: string | null;
    billingEmail?: string | null;
    mileageRate?: { toString(): string } | null;
  } | null): OrganizationProfileDto {
    return {
      companyName: row?.companyName ?? '',
      logoUrl: toPublicAssetUrl(row?.logoUrl ?? null),
      address: row?.address ?? '',
      city: row?.city ?? '',
      state: row?.state ?? '',
      zip: row?.zip ?? '',
      phone: row?.phone ?? '',
      billingEmail: row?.billingEmail ?? '',
      mileageRate: row?.mileageRate != null ? Number(row.mileageRate) : null,
    };
  }
}

function trimToNull(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}
