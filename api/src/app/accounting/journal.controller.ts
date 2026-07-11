import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { assertBalancedLines } from './accounting.util';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { JournalListQueryDto } from './dto/journal-query.dto';

const journalEntryInclude = {
  lines: {
    include: { account: { select: { id: true, code: true, name: true, type: true } } },
    orderBy: { id: 'asc' as const },
  },
  invoice: { select: { id: true, displayNumber: true } },
} satisfies Prisma.JournalEntryInclude;

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('accounting/journal')
export class JournalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: JournalListQueryDto) {
    return this.prisma.journalEntry.findMany({
      where: {
        ...((query.from || query.to) && {
          date: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        }),
      },
      include: journalEntryInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: journalEntryInclude,
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    return entry;
  }

  @Post()
  async create(@Body() dto: CreateJournalEntryDto) {
    assertBalancedLines(dto.lines);

    const accountIds = [...new Set(dto.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.account.findMany({ where: { id: { in: accountIds } } });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException('One or more accounts could not be found');
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(dto.date),
          memo: dto.memo?.trim() || undefined,
          source: 'MANUAL',
        },
      });
      await tx.journalLine.createMany({
        data: dto.lines.map((line) => ({
          journalEntryId: entry.id,
          accountId: line.accountId,
          debit: line.debit ?? 0,
          credit: line.credit ?? 0,
        })),
      });
      return tx.journalEntry.findUniqueOrThrow({
        where: { id: entry.id },
        include: journalEntryInclude,
      });
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Journal entry not found');
    if (existing.source !== 'MANUAL') {
      throw new BadRequestException(
        'Only manually-created entries can be deleted. Void the related invoice instead.',
      );
    }
    await this.prisma.journalEntry.delete({ where: { id } });
    return { deleted: true };
  }
}
