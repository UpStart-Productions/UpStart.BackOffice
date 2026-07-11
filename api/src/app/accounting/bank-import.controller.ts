import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { RequireAdminGuard } from '../auth/require-admin.guard';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SYSTEM_ACCOUNT_CODES } from './journal-posting.service';
import { bankRowExternalId, normalizeDescription, parseBankCsv } from './bank-csv.util';
import { CategorizeBankTransactionDto } from './dto/categorize-bank-transaction.dto';
import { ImportBankTransactionsDto } from './dto/import-bank-transactions.dto';

const accountSelect = { id: true, code: true, name: true } as const;

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, RequireAdminGuard)
@Controller('accounting/bank')
export class BankImportController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('transactions')
  async list(@Query('uncategorizedOnly') uncategorizedOnly?: string) {
    const transactions = await this.prisma.bankTransaction.findMany({
      where: uncategorizedOnly === 'true' ? { accountId: null } : {},
      include: { account: { select: accountSelect } },
      orderBy: { date: 'desc' },
      take: 1000,
    });

    const uncategorized = transactions.filter((t) => !t.accountId);
    if (uncategorized.length === 0) return transactions;

    const suggestions = await this.suggestionsFor(uncategorized.map((t) => t.description));
    return transactions.map((t) => {
      if (t.accountId) return { ...t, suggestedAccount: null };
      return { ...t, suggestedAccount: suggestions.get(normalizeDescription(t.description)) ?? null };
    });
  }

  @Post('import')
  async import(@Body() dto: ImportBankTransactionsDto) {
    let csvText: string;
    try {
      csvText = Buffer.from(dto.fileBase64, 'base64').toString('utf-8');
    } catch {
      throw new BadRequestException('Invalid file data');
    }

    let rows;
    try {
      rows = parseBankCsv(csvText);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Could not parse CSV');
    }
    if (rows.length === 0) {
      throw new BadRequestException('No transactions found in that file');
    }

    const importBatchId = randomUUID();
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const externalId = bankRowExternalId(row, i);
      const existing = await this.prisma.bankTransaction.findUnique({ where: { externalId } });
      if (existing) {
        skipped++;
        continue;
      }
      await this.prisma.bankTransaction.create({
        data: {
          importBatchId,
          date: new Date(row.date),
          description: row.description,
          amount: row.amount,
          externalId,
        },
      });
      imported++;
    }

    return { importBatchId, imported, skipped, total: rows.length };
  }

  @Post('transactions/:id/categorize')
  async categorize(@Param('id') id: string, @Body() dto: CategorizeBankTransactionDto) {
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if (txn.journalEntryId) {
      throw new BadRequestException('This transaction has already been posted');
    }

    const cash = await this.requireCashAccount();
    const offsetAccount = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!offsetAccount) throw new NotFoundException('Account not found');

    const posted = await this.postTransaction(txn, offsetAccount.id, cash.id);
    await this.learn(txn.description, offsetAccount.id);
    return posted;
  }

  /**
   * One-click "post everything we're confident about": posts every
   * uncategorized transaction whose description matches a learned rule,
   * using the rule's account. Skips anything without a match.
   */
  @Post('transactions/post-suggested')
  async postSuggested() {
    const uncategorized = await this.prisma.bankTransaction.findMany({
      where: { accountId: null },
    });
    if (uncategorized.length === 0) {
      return { posted: 0, skipped: 0 };
    }

    const cash = await this.requireCashAccount();
    const suggestions = await this.suggestionsFor(uncategorized.map((t) => t.description));

    let posted = 0;
    let skipped = 0;
    for (const txn of uncategorized) {
      const suggestion = suggestions.get(normalizeDescription(txn.description));
      if (!suggestion) {
        skipped++;
        continue;
      }
      await this.postTransaction(txn, suggestion.id, cash.id);
      await this.learn(txn.description, suggestion.id);
      posted++;
    }
    return { posted, skipped };
  }

  @Delete('transactions/:id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bank transaction not found');
    if (existing.journalEntryId) {
      throw new BadRequestException('This transaction has already been posted and cannot be deleted');
    }
    await this.prisma.bankTransaction.delete({ where: { id } });
    return { deleted: true };
  }

  /** Dr/Cr Cash against the chosen offset account, sized and signed by the transaction amount. */
  private async postTransaction(
    txn: { id: string; date: Date; description: string; amount: unknown },
    offsetAccountId: string,
    cashAccountId: string,
  ) {
    const amount = Number(txn.amount);
    const isInflow = amount > 0;
    const magnitude = Math.abs(amount);

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: txn.date,
          memo: txn.description,
          source: 'BANK_IMPORT',
          lines: {
            createMany: {
              data: isInflow
                ? [
                    { accountId: cashAccountId, debit: magnitude, credit: 0 },
                    { accountId: offsetAccountId, debit: 0, credit: magnitude },
                  ]
                : [
                    { accountId: offsetAccountId, debit: magnitude, credit: 0 },
                    { accountId: cashAccountId, debit: 0, credit: magnitude },
                  ],
            },
          },
        },
      });

      return tx.bankTransaction.update({
        where: { id: txn.id },
        data: { accountId: offsetAccountId, journalEntryId: entry.id },
        include: { account: { select: accountSelect } },
      });
    });
  }

  /** Remembers this description -> account choice for next time. Last choice wins; no separate rules UI. */
  private async learn(description: string, accountId: string): Promise<void> {
    const matchKey = normalizeDescription(description);
    if (!matchKey) return; // nothing stable to key on (e.g. an all-numeric wire reference)

    await this.prisma.categorizationRule.upsert({
      where: { matchKey },
      update: { accountId, matchCount: { increment: 1 }, lastUsedAt: new Date() },
      create: { matchKey, accountId },
    });
  }

  /** Batch-resolves normalized descriptions to their learned account, keyed by normalized description. */
  private async suggestionsFor(
    descriptions: string[],
  ): Promise<Map<string, { id: string; code: string; name: string }>> {
    const keys = [...new Set(descriptions.map(normalizeDescription).filter(Boolean))];
    if (keys.length === 0) return new Map();

    const rules = await this.prisma.categorizationRule.findMany({
      where: { matchKey: { in: keys } },
      include: { account: { select: accountSelect } },
    });
    return new Map(rules.map((r) => [r.matchKey, r.account]));
  }

  private async requireCashAccount() {
    const cash = await this.prisma.account.findUnique({ where: { code: SYSTEM_ACCOUNT_CODES.CASH } });
    if (!cash) {
      throw new BadRequestException(
        `Chart of accounts is missing the Cash account (${SYSTEM_ACCOUNT_CODES.CASH}).`,
      );
    }
    return cash;
  }
}
