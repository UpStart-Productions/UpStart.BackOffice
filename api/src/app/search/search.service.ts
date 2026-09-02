import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SearchResultType = 'client' | 'project' | 'invoice' | 'lead';

export type SearchResultItem = {
  type: SearchResultType;
  id: string;
  label: string;
  detail: string;
  meta: string | null;
  status?: string;
};

export type SearchResultGroup = {
  label: string;
  type: SearchResultType;
  items: SearchResultItem[];
};

export type SearchResponse = {
  groups: SearchResultGroup[];
};

const RESULT_LIMIT = 5;

const LEAD_STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  DISCOVERY: 'Discovery',
  PROPOSAL_SENT: 'Proposal Sent',
  ON_HOLD: 'On Hold',
  ACTIVE_CLIENT: 'Active Client',
  PAST_CLIENT: 'Past Client',
};

function contains(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

function formatMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function activeLabel(isActive: boolean): string {
  return isActive ? 'Active' : 'Inactive';
}

function joinDetail(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' · ');
}

function leadStageLabel(stage: string): string {
  return LEAD_STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ');
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string): Promise<SearchResponse> {
    const q = rawQuery.trim();
    if (q.length < 2) return { groups: [] };

    const [clients, projects, invoices, leads] = await Promise.all([
      this.prisma.client.findMany({
        where: {
          OR: [
            { name: contains(q) },
            { code: contains(q) },
            { email: contains(q) },
            { phone: contains(q) },
          ],
        },
        select: { id: true, name: true, code: true, email: true, isActive: true },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      this.prisma.project.findMany({
        where: {
          OR: [
            { name: contains(q) },
            { client: { name: contains(q) } },
            {
              contacts: {
                some: {
                  OR: [
                    { email: contains(q) },
                    { firstName: contains(q) },
                    { lastName: contains(q) },
                  ],
                },
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          client: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      this.prisma.invoice.findMany({
        where: {
          OR: [
            { displayNumber: contains(q) },
            { client: { name: contains(q) } },
          ],
        },
        select: {
          id: true,
          displayNumber: true,
          status: true,
          total: true,
          client: { select: { name: true } },
        },
        orderBy: { number: 'desc' },
        take: RESULT_LIMIT,
      }),
      this.prisma.lead.findMany({
        where: {
          OR: [
            { organization: contains(q) },
            { primaryContact: contains(q) },
            { email: contains(q) },
            { contactRole: contains(q) },
          ],
        },
        select: {
          id: true,
          organization: true,
          primaryContact: true,
          email: true,
          stage: true,
        },
        orderBy: { organization: 'asc' },
        take: RESULT_LIMIT,
      }),
    ]);

    const groups: SearchResultGroup[] = [];

    if (clients.length) {
      groups.push({
        label: 'Clients',
        type: 'client',
        items: clients.map((client) => ({
          type: 'client' as const,
          id: client.id,
          label: client.name,
          detail: joinDetail([client.code, client.email ?? 'No email']),
          meta: activeLabel(client.isActive),
        })),
      });
    }

    if (projects.length) {
      groups.push({
        label: 'Projects',
        type: 'project',
        items: projects.map((project) => ({
          type: 'project' as const,
          id: project.id,
          label: project.name,
          detail: project.client.name,
          meta: activeLabel(project.isActive),
        })),
      });
    }

    if (invoices.length) {
      groups.push({
        label: 'Invoices',
        type: 'invoice',
        items: invoices.map((invoice) => ({
          type: 'invoice' as const,
          id: invoice.id,
          label: invoice.displayNumber,
          detail: invoice.client.name,
          meta: joinDetail([invoice.status, formatMoney(invoice.total)]),
          status: invoice.status,
        })),
      });
    }

    if (leads.length) {
      groups.push({
        label: 'Pipeline',
        type: 'lead',
        items: leads.map((lead) => ({
          type: 'lead' as const,
          id: lead.id,
          label: lead.organization,
          detail: joinDetail([lead.primaryContact, lead.email]),
          meta: leadStageLabel(lead.stage),
        })),
      });
    }

    return { groups };
  }
}
