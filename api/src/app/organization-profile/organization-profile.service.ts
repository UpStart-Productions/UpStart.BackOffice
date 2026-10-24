import { Injectable } from '@nestjs/common';
import { currentTenantId } from '../tenancy/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';


export type OrganizationProfileDto = {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  /** Where invoices billed to the organization are sent by default. */
  billingEmail: string;
};

@Injectable()
export class OrganizationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<OrganizationProfileDto> {
    const row = await this.prisma.organizationProfile.findUnique({
      where: { tenantId: currentTenantId() },
    });
    return this.toDto(row);
  }

  async save(dto: UpdateOrganizationProfileDto): Promise<OrganizationProfileDto> {
    const data = {
      address: trimToNull(dto.address),
      city: trimToNull(dto.city),
      state: trimToNull(dto.state),
      zip: trimToNull(dto.zip),
      phone: trimToNull(dto.phone),
      billingEmail: trimToNull(dto.billingEmail),
    };
    const row = await this.prisma.organizationProfile.upsert({
      where: { tenantId: currentTenantId() },
      create: { ...data },
      update: data,
    });
    return this.toDto(row);
  }

  private toDto(row: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    billingEmail: string | null;
  } | null): OrganizationProfileDto {
    return {
      address: row?.address ?? '',
      city: row?.city ?? '',
      state: row?.state ?? '',
      zip: row?.zip ?? '',
      phone: row?.phone ?? '',
      billingEmail: row?.billingEmail ?? '',
    };
  }
}

function trimToNull(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}
