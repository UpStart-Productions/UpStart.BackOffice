import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AccessGuard, Area } from '../access/access.guard';
import { PrismaService } from '../prisma/prisma.service';
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
      select: { id: true, name: true, color: true, _count: { select: { clients: true, contacts: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, organizationCount: _count.clients, peopleCount: _count.contacts }));
  }

  /** Create a tag, or return the existing one with the same name (case-insensitive). */
  @Post()
  async create(@Body() dto: CreateCrmTagDto) {
    const [id] = await ensureCrmTags(this.prisma, [dto.name]);
    return this.prisma.tag.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, color: true } });
  }
}
