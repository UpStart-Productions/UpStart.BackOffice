import { BadRequestException } from '@nestjs/common';
import type { AccountType, Prisma } from '@prisma/client';

/** Round to 2 decimal places, avoiding floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type DebitCreditLine = { debit: Prisma.Decimal | number; credit: Prisma.Decimal | number };

function sumField(lines: DebitCreditLine[], field: 'debit' | 'credit'): number {
  return lines.reduce((sum, l) => sum + Number(l[field]), 0);
}

/**
 * Signed balance for an account given its raw debit/credit totals.
 * ASSET and EXPENSE are debit-normal; LIABILITY, EQUITY, and REVENUE are credit-normal.
 */
export function accountBalance(type: AccountType, debit: number, credit: number): number {
  const debitNormal = type === 'ASSET' || type === 'EXPENSE';
  return round2(debitNormal ? debit - credit : credit - debit);
}

export function summarizeAccountLines(type: AccountType, lines: DebitCreditLine[]) {
  const debit = round2(sumField(lines, 'debit'));
  const credit = round2(sumField(lines, 'credit'));
  return { debit, credit, balance: accountBalance(type, debit, credit) };
}

export function toBalanceRow(account: {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  lines: DebitCreditLine[];
}) {
  const { balance } = summarizeAccountLines(account.type, account.lines);
  return { id: account.id, code: account.code, name: account.name, balance };
}

/**
 * A journal entry must have at least two lines, each with exactly one of
 * debit/credit set, and total debits must equal total credits. Throws
 * BadRequestException on any violation — callers don't need to re-check.
 */
export function assertBalancedLines(lines: { debit?: number; credit?: number }[]): void {
  if (lines.length < 2) {
    throw new BadRequestException('A journal entry needs at least two lines');
  }
  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    if (debit > 0 && credit > 0) {
      throw new BadRequestException('A line cannot have both a debit and a credit amount');
    }
    if (debit === 0 && credit === 0) {
      throw new BadRequestException('Each line needs a debit or credit amount greater than zero');
    }
    if (debit < 0 || credit < 0) {
      throw new BadRequestException('Debit and credit amounts must be positive');
    }
  }
  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  if (totalDebit !== totalCredit) {
    throw new BadRequestException(
      `Entry does not balance: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`,
    );
  }
}
