import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { timeEntryWorkTasksInclude } from '../time-entries/time-entry-work-tasks.util';
import { InvoicePeriodBounds, InvoicePeriodType, resolveInvoicePeriod } from './invoice-period.util';

export type InvoicePreviewLine = {
  projectId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  timeEntryIds: string[];
  /** Expenses on this line: billable ones on a client invoice, reimbursable ones on an invoice to the tenant. */
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
  /**
   * Unbilled expenses, mileage included. CLIENT: the client's billable expenses (on its projects), at cost.
   * TENANT: the user's reimbursable expenses.
   */
  expenses: InvoicePreviewLine[];
  subtotal: number;
  canGenerate: boolean;
  missingRates: InvoicePreviewMissingRate[];
};

type TimeEntryForInvoice = Prisma.TimeEntryGetPayload<{
  include: {
    project: { select: { id: true; name: true; hourlyRate: true } };
    projectTask: { select: { id: true; name: true } };
    user: { select: { hourlyRate: true; isSuper: true } };
    workTasks: typeof timeEntryWorkTasksInclude;
  };
}>;

type BillTo = 'CLIENT' | 'TENANT';

/** The time-entry column that links to an invoice of this kind. */
export function timeLinkField(billTo: BillTo): 'invoiceLineItemId' | 'tenantInvoiceLineItemId' {
  return billTo === 'TENANT' ? 'tenantInvoiceLineItemId' : 'invoiceLineItemId';
}

/** The expense column that links to an invoice of this kind (same names as on time entries). */
export function expenseLinkField(billTo: BillTo): 'invoiceLineItemId' | 'tenantInvoiceLineItemId' {
  return timeLinkField(billTo);
}

@Injectable()
export class InvoiceFromTimeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unbilled, finished time in the period.
   * CLIENT: the client's billable time (optionally one project).
   * CLIENT also includes the client's unbilled billable expenses (on its projects), billed at cost.
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
        user: { select: { hourlyRate: true, isSuper: true } },
        workTasks: timeEntryWorkTasksInclude,
      },
      orderBy: { startedAt: 'desc' },
    });
    // Super users' pay rate in this tenant (Tenants page); their user rate is one value across every tenant.
    const superRates = new Map<string, number>();
    const superIds = [...new Set(entries.filter((e) => e.user.isSuper).map((e) => e.userId))];
    if (tenant && superIds.length) {
      const rows = await this.prisma.superUserRate.findMany({ where: { userId: { in: superIds } }, select: { userId: true, hourlyRate: true } });
      for (const r of rows) superRates.set(r.userId, Number(r.hourlyRate));
    }

    const missingRates: InvoicePreviewMissingRate[] = [];
    const byProject = new Map<string, InvoicePreviewProject>();
    const NO_PROJECT = 'No project';

    for (const entry of entries) {
      const rate = tenant ? (superRates.get(entry.userId) ?? resolveTenantHourlyRate(entry)) : resolveHourlyRate(entry);
      if (rate == null) {
        missingRates.push({
          entryId: entry.id,
          projectName: entry.project?.name ?? NO_PROJECT,
          taskName: invoiceTaskHeading(entry),
          startedAt: entry.startedAt.toISOString(),
        });
        continue;
      }

      const hours = (entry.durationMin ?? 0) / 60;
      if (hours <= 0) continue;

      const quantity = Math.round(hours * 100) / 100;
      const amount = Math.round(quantity * rate * 100) / 100;
      const line: InvoicePreviewLine = {
        projectId: entry.project?.id ?? null,
        description: buildLineDescription(
          formatEntryDate(entry.startedAt),
          invoiceTaskHeading(entry),
          invoiceTaskBodyLines(entry),
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
    const expenses = tenant
      ? params.userId
        ? await this.reimbursableExpenseLines(params.userId, bounds, params.projectId)
        : []
      : params.clientId
        ? await this.billableExpenseLines(params.clientId, bounds, params.projectId, params.userId)
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

  /**
   * Dashboard "Unbilled work": finished billable time and billable expenses not yet on a client invoice,
   * totalled per client. clientIds limits to clients the role can reach; userId to one person's entries.
   * Time with no rate is counted in hours but not in the amount (missingRateHours).
   */
  async unbilledSummary(params: { clientIds?: { in: string[] }; userId?: string }) {
    const clientWhere: Prisma.StringNullableFilter = params.clientIds ?? { not: null };
    const [entries, expenses] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          invoiceLineItemId: null,
          isBillable: true,
          stoppedAt: { not: null },
          clientId: clientWhere,
          ...(params.userId ? { userId: params.userId } : {}),
        },
        include: {
          project: { select: { id: true, name: true, hourlyRate: true } },
          projectTask: { select: { id: true, name: true } },
          user: { select: { hourlyRate: true, isSuper: true } },
          workTasks: timeEntryWorkTasksInclude,
          client: { select: { id: true, name: true } },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          isBillable: true,
          invoiceLineItemId: null,
          project: { clientId: clientWhere },
          ...(params.userId ? { userId: params.userId } : {}),
        },
        include: { project: { select: { client: { select: { id: true, name: true } } } } },
      }),
    ]);

    type Row = { clientId: string; clientName: string; hours: number; timeAmount: number; expenseAmount: number; missingRateHours: number; since: string | null };
    const byClient = new Map<string, Row>();
    const row = (id: string, name: string): Row => {
      let r = byClient.get(id);
      if (!r) {
        r = { clientId: id, clientName: name, hours: 0, timeAmount: 0, expenseAmount: 0, missingRateHours: 0, since: null };
        byClient.set(id, r);
      }
      return r;
    };
    const earliest = (r: Row, d: Date) => {
      const iso = d.toISOString();
      if (!r.since || iso < r.since) r.since = iso;
    };
    for (const e of entries) {
      if (!e.client) continue;
      const r = row(e.client.id, e.client.name);
      const hours = (e.durationMin ?? 0) / 60;
      const rate = resolveHourlyRate(e as unknown as TimeEntryForInvoice);
      r.hours += hours;
      if (rate == null) r.missingRateHours += hours;
      else r.timeAmount += hours * rate;
      earliest(r, e.startedAt);
    }
    for (const x of expenses) {
      const client = x.project?.client;
      if (!client) continue;
      const r = row(client.id, client.name);
      const isMileage = x.miles != null && x.mileageRate != null;
      r.expenseAmount += isMileage ? Number(x.miles) * Number(x.mileageRate) : Number(x.amount);
      earliest(r, x.incurredAt);
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const clients = [...byClient.values()]
      .map((r) => ({ ...r, hours: round(r.hours), timeAmount: round(r.timeAmount), expenseAmount: round(r.expenseAmount), missingRateHours: round(r.missingRateHours), total: round(r.timeAmount + r.expenseAmount) }))
      .sort((a, b) => b.total - a.total);
    return {
      total: round(clients.reduce((s, c) => s + c.total, 0)),
      hours: round(clients.reduce((s, c) => s + c.hours, 0)),
      expenseAmount: round(clients.reduce((s, c) => s + c.expenseAmount, 0)),
      clients,
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
    return rows.map(toExpenseLine);
  }

  /** The client's billable expenses in the period (on its projects) not yet on a client invoice. Billed at cost. */
  private async billableExpenseLines(
    clientId: string,
    bounds: InvoicePeriodBounds,
    projectId?: string,
    userId?: string,
  ): Promise<InvoicePreviewLine[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        isBillable: true,
        invoiceLineItemId: null,
        incurredAt: { gte: bounds.from, lte: bounds.to },
        project: { clientId },
        ...(projectId ? { projectId } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { incurredAt: 'desc' },
    });
    return rows.map(toExpenseLine);
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

  /**
   * TENANT invoices: the creator's own reimbursable expenses. CLIENT invoices: billable expenses on that client's projects
   * (only the user's own when target.userId is set). An expense already on an invoice of the same kind is rejected,
   * unless it is on invoiceId (the draft being edited).
   */
  async assertExpensesLinkable(
    target: { billTo: BillTo; clientId: string | null; userId: string | null; invoiceId?: string },
    lineItems: { expenseIds?: string[] }[],
  ): Promise<void> {
    const ids = lineItems.flatMap((li) => li.expenseIds ?? []);
    if (ids.length === 0) return;
    const tenant = target.billTo === 'TENANT';
    if (tenant && !target.userId) {
      throw new BadRequestException('Expenses can only be added to your own invoice to your business');
    }

    const unique = [...new Set(ids)];
    const expenses = await this.prisma.expense.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        userId: true,
        isReimbursable: true,
        isBillable: true,
        project: { select: { clientId: true } },
        invoiceLineItem: { select: { invoiceId: true } },
        tenantInvoiceLineItem: { select: { invoiceId: true } },
      },
    });
    if (expenses.length !== unique.length) {
      throw new BadRequestException('One or more expenses were not found');
    }
    for (const e of expenses) {
      if (target.userId && e.userId !== target.userId) {
        throw new BadRequestException('You can only invoice your own expenses');
      }
      if (tenant && !e.isReimbursable) throw new BadRequestException('Only reimbursable expenses can be invoiced to your business');
      if (!tenant && !e.isBillable) throw new BadRequestException('Only billable expenses can be invoiced to a client');
      if (!tenant && e.project?.clientId !== target.clientId) {
        throw new BadRequestException('Expense is not on a project for this client');
      }
      const linked = tenant ? e.tenantInvoiceLineItem : e.invoiceLineItem;
      if (linked && linked.invoiceId !== target.invoiceId) {
        throw new BadRequestException('One or more expenses are already invoiced');
      }
    }
  }
}

/** One invoice line per expense, at cost. Mileage shows miles x rate. */
function toExpenseLine(e: {
  id: string;
  projectId: string | null;
  incurredAt: Date;
  amount: Prisma.Decimal;
  miles: Prisma.Decimal | null;
  mileageRate: Prisma.Decimal | null;
  category: string | null;
  description: string;
}): InvoicePreviewLine {
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

function workTaskLabels(entry: TimeEntryForInvoice): string[] {
  return (entry.workTasks ?? []).map(({ task }) =>
    task.parent?.name ? `${task.parent.name} › ${task.name}` : task.name,
  );
}

/** Default/Asana task, or work task name(s) when those are all that was logged. */
function invoiceTaskHeading(entry: TimeEntryForInvoice): string | null {
  if (entry.projectTask?.name) return entry.projectTask.name;
  const work = workTaskLabels(entry);
  return work.length ? work.join(', ') : null;
}

/** Notes plus work tasks when a default task is also on the entry. */
function invoiceTaskBodyLines(entry: TimeEntryForInvoice): string[] {
  const lines: string[] = [];
  const notes = entry.description?.trim();
  if (notes) lines.push(notes);
  if (entry.projectTask?.name) lines.push(...workTaskLabels(entry));
  return lines;
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
