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

@Injectable()
export class InvoiceFromTimeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Unbilled, billable, finished time in the period.
   * CLIENT: the client's time (optionally one project). TENANT: one user's own time (optionally narrowed by client/project).
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

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        invoiceLineItemId: null,
        isBillable: true,
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
      const rate = resolveHourlyRate(entry);
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
    const subtotal = Math.round(projects.reduce((s, p) => s + p.subtotal, 0) * 100) / 100;

    return {
      period: {
        periodType: bounds.periodType,
        label: bounds.label,
        from: bounds.from.toISOString(),
        to: bounds.to.toISOString(),
      },
      projects,
      subtotal,
      canGenerate: missingRates.length === 0 && projects.length > 0,
      missingRates,
    };
  }

  /** CLIENT invoices: entries must be for that client. TENANT invoices: entries must be the creator's own. */
  async assertTimeEntriesLinkable(
    target: { billTo: 'CLIENT' | 'TENANT'; clientId: string | null; userId: string | null },
    lineItems: { projectId?: string; timeEntryIds?: string[] }[],
  ): Promise<void> {
    const ids = lineItems.flatMap((li) => li.timeEntryIds ?? []);
    if (ids.length === 0) return;

    const unique = [...new Set(ids)];
    const entries = await this.prisma.timeEntry.findMany({
      where: { id: { in: unique } },
      select: { id: true, invoiceLineItemId: true, clientId: true, userId: true },
    });

    if (entries.length !== unique.length) {
      throw new BadRequestException('One or more time entries were not found');
    }

    for (const entry of entries) {
      if (entry.invoiceLineItemId) {
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
