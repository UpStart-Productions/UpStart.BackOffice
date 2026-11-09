import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AccessGuard, Area } from '../access/access.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CLIENT_DIMENSION_KEYS, DIMENSION_TAG_KEY } from '@upstart/back-office/shared';
import { ensureCrmTags } from './crm-tags.util';

class CreateCrmTagDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}

/** Tags for organizations and people (Partner, Vendor...). Separate from task tags. */
@ApiTags('crm-tags')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('clients', 'contacts')
@Controller('crm-tags')
export class CrmTagsController {
  constructor(private readonly prisma: PrismaService) {}

  /** All CRM tags (optionally filtered by ?q=), with how many organizations and people carry each. */
  @Get()
  async list(@Query('q') q?: string) {
    const query = q?.trim();
    const rows = await this.prisma.tag.findMany({
      where: { scope: 'CRM', ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}) },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
    const [orgCounts, peopleCounts] = await Promise.all([
      Promise.all(
        rows.map((t) =>
          this.prisma.dimensionValue.count({
            where: {
              definition: { entity: 'CLIENT', key: CLIENT_DIMENSION_KEYS.tags },
              values: { has: t.name },
            },
          }),
        ),
      ),
      Promise.all(
        rows.map((t) =>
          this.prisma.dimensionValue.count({
            where: {
              definition: { entity: 'CONTACT', key: DIMENSION_TAG_KEY },
              values: { has: t.name },
            },
          }),
        ),
      ),
    ]);
    return rows.map((t, i) => ({
      ...t,
      organizationCount: orgCounts[i] ?? 0,
      peopleCount: peopleCounts[i] ?? 0,
    }));
  }

  /** Create a tag, or return the existing one with the same name (case-insensitive). */
  @Post()
  async create(@Body() dto: CreateCrmTagDto) {
    const [id] = await ensureCrmTags(this.prisma, [dto.name]);
    return this.prisma.tag.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, color: true } });
  }
}
