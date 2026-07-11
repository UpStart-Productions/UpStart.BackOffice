import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Codes the posting logic depends on. Seeded by default — see prisma/seed.ts. */
export const SYSTEM_ACCOUNT_CODES = {
  CASH: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  SALES_TAX_PAYABLE: '2000',
  REVENUE: '4000',
} as const;

type Client = PrismaService | Prisma.TransactionClient;

/**
 * Translates invoice lifecycle events into balanced journal entries. This is
 * the only place invoice state becomes accounting — invoices.controller.ts
 * calls into it, it never posts anything on its own. All methods are
 * idempotent per invoice so retries / double-clicks can't double-post.
 */
@Injectable()
export class JournalPostingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Dr Accounts Receivable / Cr Revenue (+ Cr Sales Tax Payable if the invoice carries tax). */
  async postInvoiceIssued(invoiceId: string, client: Client = this.prisma): Promise<void> {
    const already = await client.journalEntry.findFirst({
      where: { invoiceId, source: 'INVOICE_ISSUED' },
      select: { id: true },
    });
    if (already) return;

    const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return;

    const ar = await this.requireAccount(client, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenue = await this.requireAccount(client, SYSTEM_ACCOUNT_CODES.REVENUE);
    const taxAmount = Number(invoice.taxAmount ?? 0);

    const lines: Prisma.JournalLineCreateManyJournalEntryInput[] = [
      { accountId: ar.id, debit: invoice.total, credit: 0 },
      { accountId: revenue.id, debit: 0, credit: invoice.subtotal },
    ];
    if (taxAmount > 0) {
      const taxPayable = await this.requireAccount(client, SYSTEM_ACCOUNT_CODES.SALES_TAX_PAYABLE);
      lines.push({ accountId: taxPayable.id, debit: 0, credit: taxAmount });
    }

    await client.journalEntry.create({
      data: {
        date: invoice.issueDate,
        memo: `Invoice ${invoice.displayNumber} issued`,
        source: 'INVOICE_ISSUED',
        invoiceId: invoice.id,
        lines: { createMany: { data: lines } },
      },
    });
  }

  /**
   * Dr Cash / Cr Accounts Receivable. v1 supports one payment per invoice
   * (matching the mark-paid flow's single amountPaid field) — idempotent
   * per invoice, not per payment.
   */
  async postInvoicePayment(
    invoiceId: string,
    amountPaid: number,
    paidAt: Date,
    client: Client = this.prisma,
  ): Promise<void> {
    const already = await client.journalEntry.findFirst({
      where: { invoiceId, source: 'INVOICE_PAYMENT' },
      select: { id: true },
    });
    if (already) return;

    const invoice = await client.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return;

    const cash = await this.requireAccount(client, SYSTEM_ACCOUNT_CODES.CASH);
    const ar = await this.requireAccount(client, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    await client.journalEntry.create({
      data: {
        date: paidAt,
        memo: `Payment received for invoice ${invoice.displayNumber}`,
        source: 'INVOICE_PAYMENT',
        invoiceId: invoice.id,
        lines: {
          createMany: {
            data: [
              { accountId: cash.id, debit: amountPaid, credit: 0 },
              { accountId: ar.id, debit: 0, credit: amountPaid },
            ],
          },
        },
      },
    });
  }

  /** Reverses a previously posted INVOICE_ISSUED entry — called when an invoice is voided. No-op if nothing was ever posted, or already reversed. */
  async reverseInvoiceIssued(invoiceId: string, client: Client = this.prisma): Promise<void> {
    const original = await client.journalEntry.findFirst({
      where: { invoiceId, source: 'INVOICE_ISSUED' },
      include: { lines: true, invoice: { select: { displayNumber: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!original) return;

    const alreadyReversed = await client.journalEntry.findFirst({
      where: { invoiceId, source: 'INVOICE_ISSUED', memo: { contains: 'voided' } },
      select: { id: true },
    });
    if (alreadyReversed) return;

    await client.journalEntry.create({
      data: {
        date: new Date(),
        memo: `Invoice ${original.invoice?.displayNumber ?? ''} voided — reversing entry`,
        source: 'INVOICE_ISSUED',
        invoiceId,
        lines: {
          createMany: {
            data: original.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
            })),
          },
        },
      },
    });
  }

  private async requireAccount(client: Client, code: string) {
    const account = await client.account.findUnique({ where: { code } });
    if (!account) {
      throw new BadRequestException(
        `Chart of accounts is missing required account ${code}. Check Accounting > Chart of Accounts.`,
      );
    }
    return account;
  }
}
