import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { VisitTypeDto } from '@upstart/back-office/shared';
import { AccessGuard, AdminOnly, SignedIn } from '../access/access.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateVisitTypeDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

/**
 * Visit types: what the organization calls a visit ("Care shift", "Service call"). Managed in Settings → Pick lists
 * (admins); picked when scheduling and when attaching a form in Forms. A type with visits can be hidden, not deleted.
 */
@ApiTags('visit-types')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('visit-types')
export class VisitTypesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Types that can be picked (not hidden), by name. */
  @Get()
  @SignedIn()
  async list(): Promise<VisitTypeDto[]> {
    return this.rows({ isActive: true });
  }

  /** Every type with its visit count (Settings). */
  @Get('manage')
  @AdminOnly()
  async manage(): Promise<VisitTypeDto[]> {
    return this.rows({});
  }

  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateVisitTypeDto): Promise<VisitTypeDto> {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Give the visit type a name');
    const nameKey = name.toLowerCase();
    const existing = await this.prisma.visitType.findFirst({ where: { nameKey } });
    if (existing) throw new ConflictException(`"${existing.name}" is already a visit type`);
    const row = await this.prisma.visitType.create({ data: { name, nameKey } });
    return { id: row.id, name: row.name, isActive: row.isActive, visitCount: 0 };
  }

  @Post(':id/hide')
  @AdminOnly()
  async hide(@Param('id') id: string) {
    await this.find(id);
    await this.prisma.visitType.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }

  @Post(':id/restore')
  @AdminOnly()
  async restore(@Param('id') id: string) {
    await this.find(id);
    await this.prisma.visitType.update({ where: { id }, data: { isActive: true } });
    return { ok: true };
  }

  /** Delete a type nobody has used. Forms attached to it are just detached. */
  @Delete(':id')
  @AdminOnly()
  async remove(@Param('id') id: string) {
    await this.find(id);
    const used = await this.prisma.visit.count({ where: { visitTypeId: id } });
    if (used) throw new BadRequestException(`This visit type has ${used} visit${used === 1 ? '' : 's'}. Hide it instead.`);
    await this.prisma.visitSeries.deleteMany({ where: { visitTypeId: id } });
    await this.prisma.visitType.delete({ where: { id } });
    return { deleted: true };
  }

  private async find(id: string) {
    const row = await this.prisma.visitType.findFirst({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Visit type not found');
    return row;
  }

  private async rows(where: { isActive?: boolean }): Promise<VisitTypeDto[]> {
    const rows = await this.prisma.visitType.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true, _count: { select: { visits: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, visitCount: r._count.visits }));
  }
}
