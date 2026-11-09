import { Injectable } from '@nestjs/common';
import { isAdminRole } from '@upstart/back-office/shared';
import { AccessService, teamUsersWhere } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { M as FORMS_MODULE } from '../forms/free-forms.util';
import { PrismaService } from '../prisma/prisma.service';
import { TaskAccessService } from '../task-manager/task-access.service';
import { tryTenantId } from '../tenancy/tenant-context';
import { CLIENT_DIMENSION_KEYS } from '@upstart/back-office/shared';
import { focusLabelsMatchingQuery } from '../dimensions/dimensions.util';
import { clientIdsWithFocusLabels } from '../dimensions/dimensions-load.util';
import {
  careShiftScope,
  careVisitScope,
  expenseScope,
  formsOwnWhere,
  taskVisibilityWhere,
  timeEntryScope,
} from './search-scope.util';
import {
  clientIdsMatchingServiceOrProduct,
  contactTextOr,
  insensitiveContains,
  leadIdsMatchingServiceInterests,
} from './text-search.util';

export type SearchResultType =
  | 'client'
  | 'contact'
  | 'project'
  | 'task'
  | 'timeEntry'
  | 'expense'
  | 'form'
  | 'formResponse'
  | 'invoice'
  | 'lead'
  | 'booking'
  | 'careVisit'
  | 'careShift'
  | 'interaction'
  | 'user';

export type SearchResultItem = {
  type: SearchResultType;
  id: string;
  label: string;
  detail: string;
  meta: string | null;
  status?: string;
  clientId?: string | null;
  leadId?: string | null;
  projectId?: string | null;
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
};

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  CALL: 'Call',
  MEETING: 'Meeting',
  NOTE: 'Note',
};

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

function interactionTypeLabel(type: string): string {
  return INTERACTION_TYPE_LABELS[type] ?? type;
}

function tenantIdFor(user: UserContext): string {
  return user.tenantId?.trim() || tryTenantId() || 'default';
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  /** Searches only the areas the user has, scoped the same way as each area's own list. */
  async search(user: UserContext, rawQuery: string): Promise<SearchResponse> {
    const q = rawQuery.trim();
    if (q.length < 2) return { groups: [] };

    const tenantId = tenantIdFor(user);
    const ic = insensitiveContains(q);
    const clientIds = await this.access.clientIdFilter(user);
    const projectScope = await this.access.projectFilter(user);
    const none = Promise.resolve([] as never[]);

    const [catalogClientIds, leadInterestIds] = await Promise.all([
      clientIdsMatchingServiceOrProduct(this.prisma, tenantId, q),
      leadIdsMatchingServiceInterests(this.prisma, tenantId, q),
    ]);
    const focusLabels = focusLabelsMatchingQuery(q);
    const focusClientIds = focusLabels.length ? await clientIdsWithFocusLabels(this.prisma, focusLabels) : [];

    const clientOr = [
      { name: ic },
      { code: ic },
      { email: ic },
      { phone: ic },
      { website: ic },
      { address: ic },
      { city: ic },
      { state: ic },
      { zip: ic },
      { notes: ic },
      ...(catalogClientIds.length ? [{ id: { in: catalogClientIds } }] : []),
      ...(focusClientIds.length ? [{ id: { in: focusClientIds } }] : []),
    ];

    const canActivity =
      this.access.can(user, 'inbox') ||
      this.access.can(user, 'clients') ||
      this.access.can(user, 'contacts') ||
      this.access.can(user, 'pipeline');

    const formsFilter = formsOwnWhere(this.access, user);
    const [taskWhere, timeWhere, expenseWhere, visitWhere, shiftWhere] = await Promise.all([
      this.access.can(user, 'tasks') ? taskVisibilityWhere(this.taskAccess, user) : Promise.resolve({}),
      this.access.can(user, 'time') ? timeEntryScope(this.access, user) : Promise.resolve({}),
      this.access.can(user, 'expenses') ? expenseScope(this.access, user) : Promise.resolve({}),
      this.access.can(user, 'visits') ? careVisitScope(this.access, user) : Promise.resolve({}),
      this.access.can(user, 'schedule') ? careShiftScope(this.access, user) : Promise.resolve({}),
    ]);

    const [
      clients,
      contacts,
      projects,
      tasks,
      timeEntries,
      expenses,
      forms,
      formResponses,
      invoices,
      leads,
      bookings,
      careVisits,
      careShifts,
      interactions,
      teamUsers,
    ] = await Promise.all([
      !this.access.can(user, 'clients') ? none : this.prisma.client.findMany({
        where: {
          ...(clientIds ? { id: clientIds } : {}),
          OR: clientOr,
        },
        select: { id: true, name: true, code: true, email: true, isActive: true },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'contacts') ? none : this.prisma.contact.findMany({
        where: { OR: contactTextOr(q, catalogClientIds) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          title: true,
          emails: { select: { email: true }, take: 1, orderBy: { isPrimary: 'desc' } },
          accountLinks: { select: { client: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'projects') ? none : this.prisma.project.findMany({
        where: {
          AND: [projectScope ?? {}],
          OR: [
            { name: ic },
            { description: ic },
            { client: { name: ic } },
            {
              contacts: {
                some: {
                  OR: [
                    { email: ic },
                    { firstName: ic },
                    { lastName: ic },
                    { phone: ic },
                    { contact: { OR: contactTextOr(q, catalogClientIds) } },
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
      !this.access.can(user, 'tasks') ? none : this.prisma.task.findMany({
        where: {
          AND: [taskWhere],
          OR: [
            { name: ic },
            { description: ic },
            { submitterName: ic },
            { submitterEmail: ic },
          ],
        },
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'time') ? none : this.prisma.timeEntry.findMany({
        where: {
          AND: [timeWhere],
          OR: [
            { description: ic },
            { project: { name: ic } },
            { client: { name: ic } },
            { projectTask: { name: ic } },
            { task: { name: ic } },
            { user: { OR: [{ firstName: ic }, { lastName: ic }, { email: ic }, { name: ic }] } },
          ],
        },
        select: {
          id: true,
          description: true,
          startedAt: true,
          project: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'expenses') ? none : this.prisma.expense.findMany({
        where: {
          AND: [expenseWhere],
          OR: [
            { description: ic },
            { category: ic },
            { notes: ic },
            { paymentMethod: ic },
            { project: { name: ic } },
          ],
        },
        select: {
          id: true,
          description: true,
          category: true,
          amount: true,
          project: { select: { name: true } },
        },
        orderBy: { incurredAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'forms') ? none : this.prisma.form.findMany({
        where: {
          module: FORMS_MODULE,
          ...formsFilter,
          OR: [{ name: ic }, { description: ic }],
        },
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'forms') ? none : this.prisma.formResponse.findMany({
        where: {
          form: { module: FORMS_MODULE, ...formsFilter },
          OR: [
            { submitterName: ic },
            { submitterEmail: ic },
            { submitterOrganization: ic },
            { submitterPhone: ic },
            { client: { name: ic } },
            { form: { name: ic } },
          ],
        },
        select: {
          id: true,
          clientId: true,
          submitterName: true,
          submitterEmail: true,
          form: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'invoices') ? none : this.prisma.invoice.findMany({
        where: {
          AND: [this.access.level(user, 'invoices') === 'own' ? await this.access.ownInvoiceWhere(user) : {}],
          ...(clientIds ? { clientId: clientIds } : {}),
          OR: [
            { displayNumber: ic },
            { billToName: ic },
            { billToEmail: ic },
            { notes: ic },
            { client: { name: ic } },
            { lineItems: { some: { description: ic } } },
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
      !this.access.can(user, 'pipeline') ? none : this.prisma.lead.findMany({
        where: {
          OR: [
            { organization: ic },
            { primaryContact: ic },
            { email: ic },
            { phone: ic },
            { website: ic },
            { contactRole: ic },
            { category: ic },
            { warmConnection: ic },
            { nextAction: ic },
            { client: { name: ic } },
            { pipelineStage: { name: ic } },
            { contact: { OR: contactTextOr(q, catalogClientIds) } },
            { warmConnectionContact: { OR: contactTextOr(q, catalogClientIds) } },
            ...(leadInterestIds.length ? [{ id: { in: leadInterestIds } }] : []),
          ],
        },
        select: {
          id: true,
          organization: true,
          primaryContact: true,
          email: true,
          stage: true,
          pipelineStage: { select: { name: true } },
        },
        orderBy: { organization: 'asc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'bookings') ? none : this.prisma.booking.findMany({
        where: {
          OR: [
            { guestName: ic },
            { guestEmail: ic },
            { guestOrg: ic },
            { guestMessage: ic },
            { bookingType: { name: ic } },
            { lead: { organization: ic } },
          ],
        },
        select: {
          id: true,
          guestName: true,
          guestEmail: true,
          startAt: true,
          status: true,
          bookingType: { select: { name: true } },
        },
        orderBy: { startAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'visits') ? none : this.prisma.careVisit.findMany({
        where: {
          AND: [visitWhere],
          OR: [{ notes: ic }, { client: { name: ic } }, { user: { OR: [{ firstName: ic }, { lastName: ic }, { email: ic }] } }],
        },
        select: {
          id: true,
          notes: true,
          startedAt: true,
          status: true,
          client: { select: { name: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !this.access.can(user, 'schedule') ? none : this.prisma.careShift.findMany({
        where: {
          AND: [shiftWhere],
          OR: [{ notes: ic }, { client: { name: ic } }],
        },
        select: {
          id: true,
          notes: true,
          startAt: true,
          status: true,
          client: { select: { name: true } },
        },
        orderBy: { startAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !canActivity ? none : this.prisma.interaction.findMany({
        where: {
          OR: [{ subject: ic }, { bodyText: ic }, { location: ic }],
          ...(clientIds
            ? {
                OR: [
                  { clientId: clientIds },
                  ...(this.access.can(user, 'pipeline') ? [{ leadId: { not: null } }] : []),
                ],
              }
            : {}),
        },
        select: {
          id: true,
          type: true,
          subject: true,
          clientId: true,
          leadId: true,
          client: { select: { name: true } },
          lead: { select: { organization: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: RESULT_LIMIT,
      }),
      !isAdminRole(user.role) ? none : this.prisma.user.findMany({
        where: {
          ...teamUsersWhere(),
          OR: [
            { email: ic },
            { firstName: ic },
            { lastName: ic },
            { name: ic },
          ],
        },
        select: { id: true, email: true, firstName: true, lastName: true, name: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: RESULT_LIMIT,
      }),
    ]);

    const groups: SearchResultGroup[] = [];

    if (clients.length) {
      groups.push({
        label: 'Organizations',
        type: 'client',
        items: clients.map((client) => ({
          type: 'client' as const,
          id: client.id,
          label: client.name,
          detail: joinDetail([client.code ?? null, client.email ?? 'No email']),
          meta: activeLabel(client.isActive),
        })),
      });
    }

    if (contacts.length) {
      groups.push({
        label: 'People',
        type: 'contact',
        items: contacts.map((contact) => {
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || 'Person';
          return {
            type: 'contact' as const,
            id: contact.id,
            label: name,
            detail: joinDetail([
              contact.title,
              contact.emails[0]?.email,
              contact.accountLinks[0]?.client.name,
            ]),
            meta: null,
          };
        }),
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
          detail: project.client?.name ?? 'Personal',
          meta: activeLabel(project.isActive),
        })),
      });
    }

    if (tasks.length) {
      groups.push({
        label: 'Tasks',
        type: 'task',
        items: tasks.map((task) => ({
          type: 'task' as const,
          id: task.id,
          label: task.name,
          detail: task.project?.name ?? '',
          meta: null,
          projectId: task.projectId,
        })),
      });
    }

    if (timeEntries.length) {
      groups.push({
        label: 'Time',
        type: 'timeEntry',
        items: timeEntries.map((row) => ({
          type: 'timeEntry' as const,
          id: row.id,
          label: row.description?.trim() || 'Time entry',
          detail: joinDetail([row.project?.name, row.client?.name]),
          meta: row.startedAt.toISOString().slice(0, 10),
        })),
      });
    }

    if (expenses.length) {
      groups.push({
        label: 'Expenses',
        type: 'expense',
        items: expenses.map((row) => ({
          type: 'expense' as const,
          id: row.id,
          label: row.description,
          detail: joinDetail([row.category, row.project?.name]),
          meta: formatMoney(row.amount),
        })),
      });
    }

    if (forms.length) {
      groups.push({
        label: 'Forms',
        type: 'form',
        items: forms.map((row) => ({
          type: 'form' as const,
          id: row.id,
          label: row.name,
          detail: row.description?.trim() ?? '',
          meta: null,
        })),
      });
    }

    if (formResponses.length) {
      groups.push({
        label: 'Form submissions',
        type: 'formResponse',
        items: formResponses.map((row) => ({
          type: 'formResponse' as const,
          id: row.id,
          label: row.submitterName?.trim() || row.form.name,
          detail: joinDetail([row.form.name, row.client?.name, row.submitterEmail]),
          meta: null,
          clientId: row.clientId,
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
          detail: invoice.client?.name ?? 'Internal',
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
          meta: lead.pipelineStage?.name ?? leadStageLabel(lead.stage),
        })),
      });
    }

    if (bookings.length) {
      groups.push({
        label: 'Bookings',
        type: 'booking',
        items: bookings.map((row) => ({
          type: 'booking' as const,
          id: row.id,
          label: row.guestName,
          detail: joinDetail([row.bookingType?.name, row.guestEmail]),
          meta: joinDetail([row.status, row.startAt.toISOString().slice(0, 10)]),
          status: row.status,
        })),
      });
    }

    if (careVisits.length) {
      groups.push({
        label: 'Care visits',
        type: 'careVisit',
        items: careVisits.map((row) => ({
          type: 'careVisit' as const,
          id: row.id,
          label: row.client.name,
          detail: row.notes?.trim().slice(0, 80) ?? '',
          meta: joinDetail([row.status, row.startedAt.toISOString().slice(0, 10)]),
        })),
      });
    }

    if (careShifts.length) {
      groups.push({
        label: 'Schedule',
        type: 'careShift',
        items: careShifts.map((row) => ({
          type: 'careShift' as const,
          id: row.id,
          label: row.client.name,
          detail: row.notes?.trim().slice(0, 80) ?? '',
          meta: joinDetail([row.status, row.startAt.toISOString().slice(0, 10)]),
        })),
      });
    }

    if (interactions.length) {
      groups.push({
        label: 'Activity',
        type: 'interaction',
        items: interactions.map((row) => ({
          type: 'interaction' as const,
          id: row.id,
          label: row.subject?.trim() || interactionTypeLabel(row.type),
          detail: row.client?.name ?? row.lead?.organization ?? '',
          meta: interactionTypeLabel(row.type),
          clientId: row.clientId,
          leadId: row.leadId,
        })),
      });
    }

    if (teamUsers.length) {
      groups.push({
        label: 'Team',
        type: 'user',
        items: teamUsers.map((row) => {
          const label =
            [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
            row.name?.trim() ||
            row.email;
          return {
            type: 'user' as const,
            id: row.id,
            label,
            detail: row.email,
            meta: null,
          };
        }),
      });
    }

    return { groups };
  }
}
