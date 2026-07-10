import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNetworkCompanyDto } from './dto/create-network-company.dto';
import { UpdateNetworkCompanyDto } from './dto/update-network-company.dto';

const companyInclude: Prisma.NetworkCompanyInclude = {
  contacts: { orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }] },
};

@ApiTags('network')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('network/companies')
export class NetworkCompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    return this.prisma.networkCompany.findMany({
      include: {
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateNetworkCompanyDto) {
    const { primaryContact, lastContactDate, ...companyData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.networkCompany.create({
        data: {
          name: companyData.name,
          website: companyData.website,
          email: companyData.email,
          phone: companyData.phone,
          description: companyData.description,
          services: companyData.services ?? [],
          products: companyData.products ?? [],
          focusCategories: companyData.focusCategories ?? [],
          notes: companyData.notes,
          isActive: companyData.isActive ?? true,
          isReferralReady: companyData.isReferralReady ?? false,
          isPublicFeatured: companyData.isPublicFeatured ?? false,
          publicSortOrder: companyData.publicSortOrder ?? 0,
          lastContactDate: lastContactDate ? new Date(lastContactDate) : undefined,
        },
      });

      if (primaryContact?.firstName?.trim()) {
        await tx.networkContact.create({
          data: {
            companyId: company.id,
            firstName: primaryContact.firstName.trim(),
            lastName: primaryContact.lastName?.trim() || null,
            title: primaryContact.title?.trim() || null,
            email: primaryContact.email,
            phone: primaryContact.phone,
            linkedInUrl: primaryContact.linkedInUrl?.trim() || null,
            isPrimary: true,
            lastContactDate: primaryContact.lastContactDate
              ? new Date(primaryContact.lastContactDate)
              : undefined,
          },
        });
      }

      return tx.networkCompany.findUniqueOrThrow({
        where: { id: company.id },
        include: companyInclude,
      });
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const company = await this.prisma.networkCompany.findUnique({
      where: { id },
      include: companyInclude,
    });
    if (!company) throw new NotFoundException('Network company not found');
    return company;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateNetworkCompanyDto) {
    const existing = await this.prisma.networkCompany.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network company not found');

    return this.prisma.networkCompany.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.services !== undefined && { services: dto.services }),
        ...(dto.products !== undefined && { products: dto.products }),
        ...(dto.focusCategories !== undefined && { focusCategories: dto.focusCategories }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isReferralReady !== undefined && { isReferralReady: dto.isReferralReady }),
        ...(dto.isPublicFeatured !== undefined && { isPublicFeatured: dto.isPublicFeatured }),
        ...(dto.publicSortOrder !== undefined && { publicSortOrder: dto.publicSortOrder }),
        ...(dto.lastContactDate !== undefined && {
          lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null,
        }),
      },
      include: companyInclude,
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.networkCompany.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Network company not found');
    await this.prisma.networkCompany.delete({ where: { id } });
    return { deleted: true };
  }
}
