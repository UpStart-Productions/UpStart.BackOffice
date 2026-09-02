import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';

const PROFILE_ID = 'default';

export type OrganizationProfileDto = {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

@Injectable()
export class OrganizationProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<OrganizationProfileDto> {
    const row = await this.prisma.organizationProfile.findUnique({
      where: { id: PROFILE_ID },
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
    };
    const row = await this.prisma.organizationProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...data },
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
  } | null): OrganizationProfileDto {
    return {
      address: row?.address ?? '',
      city: row?.city ?? '',
      state: row?.state ?? '',
      zip: row?.zip ?? '',
      phone: row?.phone ?? '',
    };
  }
}

function trimToNull(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}
