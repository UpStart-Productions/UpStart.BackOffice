import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { accountBalance, round2, toBalanceRow } from './accounting.util';
import { AsOfQueryDto, ReportRangeQueryDto } from './dto/reports-query.dto';

const EPOCH = new Date('1970-01-01T00:00:00.000Z');

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('accounting/reports')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('trial-balance')
  async trialBalance(@Query() query: AsOfQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
      include: { lines: { where: { journalEntry: { date: { lte: asOf } } }, select: { debit: true, credit: true } } },
    });

    const rows = accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: round2(a.lines.reduce((s, l) => s + Number(l.debit), 0)),
      credit: round2(a.lines.reduce((s, l) => s + Number(l.credit), 0)),
    }));

    return {
      asOf: asOf.toISOString(),
      rows,
      totals: {
        debit: round2(rows.reduce((s, r) => s + r.debit, 0)),
        credit: round2(rows.reduce((s, r) => s + r.credit, 0)),
      },
    };
  }

  @Get('profit-loss')
  async profitLoss(@Query() query: ReportRangeQueryDto) {
    const from = query.from ? new Date(query.from) : EPOCH;
    const to = query.to ? new Date(query.to) : new Date();

    const accounts = await this.prisma.account.findMany({
      where: { type: { in: ['REVENUE', 'EXPENSE'] } },
      orderBy: { code: 'asc' },
      include: {
        lines: { where: { journalEntry: { date: { gte: from, lte: to } } }, select: { debit: true, credit: true } },
      },
    });

    const revenue = accounts.filter((a) => a.type === 'REVENUE').map(toBalanceRow);
    const expenses = accounts.filter((a) => a.type === 'EXPENSE').map(toBalanceRow);
    const totalRevenue = round2(revenue.reduce((s, r) => s + r.balance, 0));
    const totalExpenses = round2(expenses.reduce((s, r) => s + r.balance, 0));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: round2(totalRevenue - totalExpenses),
    };
  }

  @Get('balance-sheet')
  async balanceSheet(@Query() query: AsOfQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();

    const balanceSheetAccounts = await this.prisma.account.findMany({
      where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
      orderBy: { code: 'asc' },
      include: { lines: { where: { journalEntry: { date: { lte: asOf } } }, select: { debit: true, credit: true } } },
    });

    const assets = balanceSheetAccounts.filter((a) => a.type === 'ASSET').map(toBalanceRow);
    const liabilities = balanceSheetAccounts.filter((a) => a.type === 'LIABILITY').map(toBalanceRow);
    const equity = balanceSheetAccounts.filter((a) => a.type === 'EQUITY').map(toBalanceRow);

    // Retained earnings: cumulative net income through asOf, folded into equity
    // so the sheet balances without needing a manual closing-entry step.
    const plAccounts = await this.prisma.account.findMany({
      where: { type: { in: ['REVENUE', 'EXPENSE'] } },
      include: { lines: { where: { journalEntry: { date: { lte: asOf } } }, select: { debit: true, credit: true } } },
    });
    const retainedEarnings = round2(
      plAccounts.reduce((sum, a) => {
        const debit = a.lines.reduce((s, l) => s + Number(l.debit), 0);
        const credit = a.lines.reduce((s, l) => s + Number(l.credit), 0);
        const balance = accountBalance(a.type, debit, credit);
        return sum + (a.type === 'REVENUE' ? balance : -balance);
      }, 0),
    );

    const totalAssets = round2(assets.reduce((s, r) => s + r.balance, 0));
    const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.balance, 0));
    const totalEquity = round2(equity.reduce((s, r) => s + r.balance, 0) + retainedEarnings);

    return {
      asOf: asOf.toISOString(),
      assets,
      liabilities,
      equity,
      retainedEarnings,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: totalAssets === round2(totalLiabilities + totalEquity),
    };
  }
}
