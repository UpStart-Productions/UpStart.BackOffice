import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { summarizeAccountLines } from './accounting.util';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccessGuard, AdminOnly } from '../access/access.guard';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@AdminOnly()
@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
      include: { lines: { select: { debit: true, credit: true } } },
    });
    return accounts.map(({ lines, ...account }) => ({
      ...account,
      ...summarizeAccountLines(account.type, lines),
    }));
  }

  @Post()
  async create(@Body() dto: CreateAccountDto) {
    const existing = await this.prisma.account.findFirst({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`Account code ${dto.code} is already in use`);
    }
    return this.prisma.account.create({ data: dto });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const existing = await this.prisma.account.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Account not found');
    return this.prisma.account.update({ where: { id }, data: dto });
  }
}
