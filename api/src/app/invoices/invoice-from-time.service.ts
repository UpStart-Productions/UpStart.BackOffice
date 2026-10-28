import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePeriodBounds, InvoicePeriodType, resolveInvoicePeriod } from './invoice-period.util';

export type InvoicePreviewLine = {
  projectId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  timeEntryIds: string[];
  /** Reimbursable expenses on this line (invoices billed to the tenant only). */
  expenseIds?: string[];
  /** ISO timestamp of the time entry; used to sort newest-first on the invoice. */
  startedAt: string;
};

/** Lines grouped by project; projectId null groups time logged without a project. */
export type InvoicePreviewProject = {
  projectId: string | null;
  projectName: string;
  lines: InvoicePreviewLine[];
  subtotal: number;
};

export type InvoicePreviewMissingRate = {
  entryId: string;
  projectName: string;
  taskName: string | null;
  startedAt: string;
};

export type InvoicePreviewResult = {
  period: {
    periodType: InvoicePeriodBounds['periodType'];
    from: string;
    to: string;
    label: string;
  };
  projects: InvoicePreviewProject[];
  /** Unbilled reimbursable expenses (mileage included). Only for invoices billed to the tenant. */
  expenses: InvoicePreviewLine[];
  subtotal: number;
  canGenerate: boolean;
  missingRates: InvoicePreviewMissingRate[];
};

type TimeEntryForInvoice = Prisma.TimeEntryGetPayload<{
  include: {
    project: { select: { id: true; name: true; hourlyRate: true } };
    projectTask: { select: { id: true; name: true } };
    user: { select: { hourlyRate: true } };
  };
}>;

type BillTo = 'CLIENT' | 'TENANT';

/** The time-entry column that links to an invoice of this kind. */
export function timeLinkField(billTo: BillTo): 'invoiceLineItemId' | 'tenantInvoiceLineItemId' {
  return billTo === 'TENANT' ? 'tenantInvoiceLineItemId' : 'invoiceLineItemId';
}

@Injectable()
export class InvoiceFromTimeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unbilled, finished time in the period.
   * CLIENT: the client's billable time (optionally one project).
   * TENANT: one user's own time, billable or not (optionally narrowed by client/project), plus their unbilled reimbursable expenses.
   * Each kind has its own link on the time entry, so time on a client invoice can still go on the user's invoice to the tenant.
   * userId limits to that user's entries (always set for TENANT, and for roles limited to their own invoices).
   */
  async buildPreview(params: {
    billTo: 'CLIENT' | 'TENANT';
    clientId?: string;
    projectId?: string;
    userId?: string;
    periodType: InvoicePeriodType;
    month?: number;
    year?: number;
    quarter?: number;
    from?: string;
    to?: string;
  }): Promise<InvoicePreviewResult> {
    const bounds = resolveInvoicePeriod(params);

    const tenant = params.billTo === 'TENANT';
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        [timeLinkField(params.billTo)]: null,
        ...(tenant ? {} : { isBillable: true }),
        startedAt: { gte: bounds.from },
        stoppedAt: { not: null, lte: bounds.to },
        ...(params.clientId ? { clientId: params.clientId } : {}),
        ...(params.projectId ? { projectId: params.projectId } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
      },
      include: {
        project: { select: { id: true, name: true, hourlyRate: true } },
        projectTask: { select: { id: true, name: true } },
        user: { select: { hourlyRate: true } },
      },
      orderBy: { startedAt: 'desc' },
    });

    const missingRates: InvoicePreviewMissingRate[] = [];
    const byProject = new Map<string, InvoicePreviewProject>();
    const NO_PROJECT = 'No project';

    for (const entry of entries) {
      const rate = tenant ? resolveTenantHourlyRate(entry) : resolveHourlyRate(entry);
      if (rate == null) {
        missingRates.push({
          entryId: entry.id,
          projectName: entry.project?.name ?? NO_PROJECT,
          taskName: entry.projectTask?.name ?? null,
          startedAt: entry.startedAt.toISOString(),
        });
        continue;
      }

      const hours = (entry.durationMin ?? 0) / 60;
      if (hours <= 0) continue;

      const quantity = Math.round(hours * 100) / 100;
      const amount = Math.round(quantity * rate * 100) / 100;
      const description = entry.description?.trim() ?? '';
      const line: InvoicePreviewLine = {
        projectId: entry.project?.id ?? null,
        description: buildLineDescription(
          formatEntryDate(entry.startedAt),
          entry.projectTask?.name ?? null,
          description ? [description] : [],
        ),
        quantity,
        unitPrice: rate,
        amount,
        timeEntryIds: [entry.id],
        startedAt: entry.startedAt.toISOString(),
      };

      const key = entry.project?.id ?? '';
      let projectBlock = byProject.get(key);
      if (!projectBlock) {
        projectBlock = {
          projectId: entry.project?.id ?? null,
          projectName: entry.project?.name ?? NO_PROJECT,
          lines: [],
          subtotal: 0,
        };
        byProject.set(key, projectBlock);
      }
      projectBlock.lines.push(line);
      projectBlock.subtotal = Math.round((projectBlock.subtotal + amount) * 100) / 100;
    }

    // Keep project blocks, but expose lines newest-first overall for invoice ordering.
    const projects = [...byProject.values()]
      .map((p) => ({
        ...p,
        lines: [...p.lines].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      }))
      .sort((a, b) => {
        const aLatest = a.lines[0]?.startedAt ?? '';
        const bLatest = b.lines[0]?.startedAt ?? '';
        return bLatest.localeCompare(aLatest) || a.projectName.localeCompare(b.projectName);
      });
    const expenses = tenant && params.userId
      ? await this.reimbursableExpenseLines(params.userId, bounds, params.projectId)
      : [];
    const expenseTotal = expenses.reduce((s, l) => s + l.amount, 0);
    const subtotal = Math.round((projects.reduce((s, p) => s + p.subtotal, 0) + expenseTotal) * 100) / 100;

    return {
      period: {
        periodType: bounds.periodType,
        label: bounds.label,
        from: bounds.from.toISOString(),
        to: bounds.to.toISOString(),
      },
      projects,
      expenses,
      subtotal,
      canGenerate: missingRates.length === 0 && (projects.length > 0 || expenses.length > 0),
      missingRates,
    };
  }

  /** The user's reimbursable expenses in the period not yet on an invoice to the tenant. Mileage shows miles x rate. */
  private async reimbursableExpenseLines(
    userId: string,
    bounds: InvoicePeriodBounds,
    projectId?: string,
  ): Promise<InvoicePreviewLine[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        userId,
        isReimbursable: true,
        tenantInvoiceLineItemId: null,
        incurredAt: { gte: bounds.from, lte: bounds.to },
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { incurredAt: 'desc' },
    });
    return rows.map((e) => {
      const isMileage = e.miles != null && e.mileageRate != null;
      const quantity = isMileage ? Number(e.miles) : 1;
      const unitPrice = isMileage ? Number(e.mileageRate) : Number(e.amount);
      const heading = `${formatEntryDate(e.incurredAt)} — ${isMileage ? `Mileage (${quantity} mi)` : e.category?.trim() || 'Expense'}`;
      return {
        projectId: e.projectId,
        description: [heading, e.description?.trim()].filter(Boolean).join('\n'),
        quantity,
        unitPrice,
        amount: Number(e.amount),
        timeEntryIds: [],
        expenseIds: [e.id],
        startedAt: e.incurredAt.toISOString(),
      };
    });
  }

  /**
   * CLIENT invoices: entries must be for that client. TENANT invoices: entries must be the creator's own.
   * An entry already on an invoice of the same kind is rejected, unless it is on invoiceId (the draft being edited).
   */
  async assertTimeEntriesLinkable(
    target: { billTo: BillTo; clientId: string | null; userId: string | null; invoiceId?: string },
    lineItems: { projectId?: string; timeEntryIds?: string[] }[],
  ): Promise<void> {
    const ids = lineItems.flatMap((li) => li.timeEntryIds ?? []);
    if (ids.length === 0) return;

    const unique = [...new Set(ids)];
    const linkRelation = target.billTo === 'TENANT' ? 'tenantInvoiceLineItem' : 'invoiceLineItem';
    const entries = await this.prisma.timeEntry.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        clientId: true,
        userId: true,
        invoiceLineItem: { select: { invoiceId: true } },
        tenantInvoiceLineItem: { select: { invoiceId: true } },
      },
    });

    if (entries.length !== unique.length) {
      throw new BadRequestException('One or more time entries were not found');
    }

    for (const entry of entries) {
      const linked = entry[linkRelation];
      if (linked && linked.invoiceId !== target.invoiceId) {
        throw new BadRequestException('One or more time entries are already invoiced');
      }
      if (target.billTo === 'CLIENT' && entry.clientId !== target.clientId) {
        throw new BadRequestException('Time entry does not belong to this client');
      }
      if (target.userId && entry.userId !== target.userId) {
        throw new BadRequestException('You can only invoice your own time');
      }
    }
  }

  /** Expenses go only on invoices billed to the tenant: the creator's own, reimbursable, and not on another invoice. */
  async assertExpensesLinkable(
    target: { billTo: BillTo; userId: string | null; invoiceId?: string },
    lineItems: { expenseIds?: string[] }[],
  ): Promise<void> {
    const ids = lineItems.flatMap((li) => li.expenseIds ?? []);
    if (ids.length === 0) return;
    if (target.billTo !== 'TENANT' || !target.userId) {
      throw new BadRequestException('Expenses can only be added to an invoice billed to your organization');
    }

    const unique = [...new Set(ids)];
    const expenses = await this.prisma.expense.findMany({
      where: { id: { in: unique } },
      select: { id: true, userId: true, isReimbursable: true, tenantInvoiceLineItem: { select: { invoiceId: true } } },
    });
    if (expenses.length !== unique.length) {
      throw new BadRequestException('One or more expenses were not found');
    }
    for (const e of expenses) {
      if (e.userId !== target.userId) throw new BadRequestException('You can only invoice your own expenses');
      if (!e.isReimbursable) throw new BadRequestException('Only reimbursable expenses can be invoiced');
      if (e.tenantInvoiceLineItem && e.tenantInvoiceLineItem.invoiceId !== target.invoiceId) {
        throw new BadRequestException('One or more expenses are already invoiced');
      }
    }
  }
}

/** Paying a user: their own rate comes first, since entry and project rates are what the client is charged. */
function resolveTenantHourlyRate(entry: TimeEntryForInvoice): number | null {
  if (entry.user.hourlyRate != null) return Number(entry.user.hourlyRate);
  return resolveHourlyRate(entry);
}

function resolveHourlyRate(entry: TimeEntryForInvoice): number | null {
  if (entry.hourlyRate != null) return Number(entry.hourlyRate);
  if (entry.project?.hourlyRate != null) return Number(entry.project.hourlyRate);
  if (entry.user.hourlyRate != null) return Number(entry.user.hourlyRate);
  return null;
}

/** MM/DD/YY for invoice line descriptions. */
function formatEntryDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}

function buildLineDescription(
  dateLabel: string,
  taskName: string | null,
  descriptions: string[],
): string {
  const uniqueDescs = [...new Set(descriptions)];
  const heading = taskName ? `${dateLabel} — ${taskName}` : dateLabel;
  const parts: string[] = [heading];
  if (uniqueDescs.length) {
    parts.push('');
    parts.push(...uniqueDescs);
  }
  return parts.join('\n').trim() || heading || 'Time';
}
