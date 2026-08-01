import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicePeriodBounds, InvoicePeriodType, resolveInvoicePeriod } from './invoice-period.util';

export type InvoicePreviewLine = {
  projectId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  timeEntryIds: string[];
};

export type InvoicePreviewProject = {
  projectId: string;
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

  async buildPreview(params: {
    clientId: string;
    projectId?: string;
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
        project: {
          clientId: params.clientId,
          ...(params.projectId ? { id: params.projectId } : {}),
        },
      },
      include: {
        project: { select: { id: true, name: true, hourlyRate: true } },
        projectTask: { select: { id: true, name: true } },
        user: { select: { hourlyRate: true } },
      },
      orderBy: [{ project: { name: 'asc' } }, { startedAt: 'asc' }],
    });

    const missingRates: InvoicePreviewMissingRate[] = [];
    const byProject = new Map<string, InvoicePreviewProject>();

    for (const entry of entries) {
      const rate = resolveHourlyRate(entry);
      if (rate == null) {
        missingRates.push({
          entryId: entry.id,
          projectName: entry.project.name,
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
        projectId: entry.project.id,
        description: buildLineDescription(
          entry.projectTask?.name ?? null,
          description ? [description] : [],
        ),
        quantity,
        unitPrice: rate,
        amount,
        timeEntryIds: [entry.id],
      };

      let projectBlock = byProject.get(entry.project.id);
      if (!projectBlock) {
        projectBlock = {
          projectId: entry.project.id,
          projectName: entry.project.name,
          lines: [],
          subtotal: 0,
        };
        byProject.set(entry.project.id, projectBlock);
      }
      projectBlock.lines.push(line);
      projectBlock.subtotal = Math.round((projectBlock.subtotal + amount) * 100) / 100;
    }

    const projects = [...byProject.values()].sort((a, b) =>
      a.projectName.localeCompare(b.projectName),
    );
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

  async assertTimeEntriesLinkable(
    clientId: string,
    lineItems: { projectId?: string; timeEntryIds?: string[] }[],
  ): Promise<void> {
    const ids = lineItems.flatMap((li) => li.timeEntryIds ?? []);
    if (ids.length === 0) return;

    const unique = [...new Set(ids)];
    const entries = await this.prisma.timeEntry.findMany({
      where: { id: { in: unique } },
      include: { project: { select: { clientId: true } } },
    });

    if (entries.length !== unique.length) {
      throw new BadRequestException('One or more time entries were not found');
    }

    for (const entry of entries) {
      if (entry.invoiceLineItemId) {
        throw new BadRequestException('One or more time entries are already invoiced');
      }
      if (entry.project.clientId !== clientId) {
        throw new BadRequestException('Time entry does not belong to this client');
      }
    }
  }
}

function resolveHourlyRate(entry: TimeEntryForInvoice): number | null {
  if (entry.hourlyRate != null) return Number(entry.hourlyRate);
  if (entry.project.hourlyRate != null) return Number(entry.project.hourlyRate);
  if (entry.user.hourlyRate != null) return Number(entry.user.hourlyRate);
  return null;
}

function buildLineDescription(taskName: string | null, descriptions: string[]): string {
  const uniqueDescs = [...new Set(descriptions)];
  const parts: string[] = [];
  if (taskName) parts.push(taskName);
  if (uniqueDescs.length) {
    if (parts.length) parts.push('');
    parts.push(...uniqueDescs);
  }
  return parts.join('\n').trim() || taskName || 'Time';
}
