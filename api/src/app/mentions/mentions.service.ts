import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GUEST_ROLE } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { AccessService, usersWithArea } from '../access/access.service';
import { DEFAULT_TENANT_ID } from '../communications/communications.constants';
import { PrismaService } from '../prisma/prisma.service';
import { person } from '../task-manager/task-mappers';
import { TaskAccessService } from '../task-manager/task-access.service';
import { personSelect, superUserMembers } from '../task-manager/task-people.util';

export type MentionUserCandidateDto = {
  kind: 'user';
  id: string;
  label: string;
  firstName: string;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
};

export type MentionContactCandidateDto = {
  kind: 'contact';
  id: string;
  label: string;
  email: string | null;
};

export type MentionTaskCandidateDto = {
  kind: 'task';
  id: string;
  label: string;
  projectId: string;
  projectName: string;
};

export type MentionProjectCandidateDto = {
  kind: 'project';
  id: string;
  label: string;
  clientName: string | null;
};

export type MentionCrmProjectCandidateDto = {
  kind: 'crmProject';
  id: string;
  label: string;
  clientName: string | null;
};

export type MentionInvoiceCandidateDto = {
  kind: 'invoice';
  id: string;
  label: string;
  /** Secondary line in the @ list: bill-to name, total, issue date. */
  detail: string;
};

export type MentionCandidateDto =
  | MentionUserCandidateDto
  | MentionContactCandidateDto
  | MentionTaskCandidateDto
  | MentionProjectCandidateDto
  | MentionCrmProjectCandidateDto
  | MentionInvoiceCandidateDto;

const TENANT = DEFAULT_TENANT_ID;
const ACTIVITY_TASK_MIN_QUERY_CHARS = 2;

@Injectable()
export class MentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly taskAccess: TaskAccessService,
  ) {}

  async listCandidates(
    user: UserContext,
    options: {
      q?: string;
      clientId?: string | null;
      projectId?: string | null;
      context?: string | null;
      limit?: number;
    },
  ): Promise<MentionCandidateDto[]> {
    const q = options.q?.trim().toLowerCase() ?? '';
    const qRaw = options.q?.trim() ?? '';
    const context = options.context?.trim() || null;
    const defaultLimit = context === 'activity' ? 30 : 20;
    const take = Math.min(Math.max(options.limit ?? defaultLimit, 1), 50);
    const clientId = options.clientId?.trim() || null;
    const projectId = options.projectId?.trim() || null;

    const parts: MentionCandidateDto[] = [];

    if (projectId) {
      await this.taskAccess.assertProject(user, projectId, 'view');
      parts.push(...(await this.listProjectUsers(user, projectId, q)));
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { clientId: true },
      });
      if (project?.clientId) {
        await this.assertClientAccess(user, project.clientId);
        parts.push(...(await this.listClientContacts(project.clientId, q)));
      }
      parts.push(...(await this.listTasksInProject(projectId, q)));
    } else if (clientId && context === 'activity') {
      await this.assertClientAccess(user, clientId);
      parts.push(...(await this.listClientActivityUsers(user, clientId, q)));
      parts.push(...(await this.listClientContacts(clientId, q)));
      parts.push(...(await this.listClientInvoices(clientId, q)));
      parts.push(...(await this.listClientTmProjects(user, clientId, q)));
      parts.push(...(await this.listClientCrmProjects(clientId, q)));
      parts.push(...(await this.listClientTasksSearch(user, clientId, qRaw)));
      return this.mergeAndRankActivity(parts, q, take);
    } else if (clientId) {
      await this.assertClientAccess(user, clientId);
      parts.push(...(await this.listTeamUsers(user.id, q)));
      parts.push(...(await this.listClientContacts(clientId, q)));
      parts.push(...(await this.listClientTaskProjects(user, clientId, q)));
    } else {
      parts.push(...(await this.listTeamUsers(user.id, q)));
    }

    return this.mergeAndRank(parts, q, take);
  }

  private async assertClientAccess(user: UserContext, clientId: string): Promise<void> {
    const allowed = await this.access.clientIds(user);
    if (allowed && !allowed.includes(clientId)) {
      throw new NotFoundException('Client not found.');
    }
    const row = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!row) throw new NotFoundException('Client not found.');
  }

  private async listTeamUsers(excludeUserId: string, q: string): Promise<MentionUserCandidateDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['ADMIN', 'USER'] },
        NOT: { tenantRole: { key: GUEST_ROLE.key } },
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: personSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 80,
    });
    return users
      .filter((u) => u.id !== excludeUserId)
      .map((u) => this.toUserCandidate(u));
  }

  private async listProjectUsers(user: UserContext, projectId: string, q: string): Promise<MentionUserCandidateDto[]> {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      OR: [usersWithArea('tasks', 'all'), { projectMemberships: { some: { projectId } } }],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };
    const users = await this.prisma.user.findMany({ where, select: personSelect, take: 80 });
    const supers = (await superUserMembers(this.prisma, [projectId])).filter((s) => !users.some((u) => u.id === s.id));
    return [...users, ...supers]
      .filter((u) => u.id !== user.id)
      .map((u) => this.toUserCandidate(u));
  }

  private async listClientActivityUsers(
    user: UserContext,
    clientId: string,
    q: string,
  ): Promise<MentionUserCandidateDto[]> {
    const projectIds = await this.clientTmProjectIds(user, clientId);
    if (!projectIds.length) {
      return [];
    }

    const where: Prisma.UserWhereInput = {
      isActive: true,
      OR: [usersWithArea('tasks', 'all'), { projectMemberships: { some: { projectId: { in: projectIds } } } }],
      NOT: { tenantRole: { key: GUEST_ROLE.key } },
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };
    const users = await this.prisma.user.findMany({ where, select: personSelect, take: 40 });
    const supers = (await superUserMembers(this.prisma, projectIds)).filter((s) => !users.some((u) => u.id === s.id));
    return [...users, ...supers]
      .filter((u) => u.id !== user.id)
      .map((u) => this.toUserCandidate(u));
  }

  private async clientTmProjectIds(user: UserContext, clientId: string): Promise<string[]> {
    const visible = await this.taskAccess.visibleProjectIds(user);
    const rows = await this.prisma.project.findMany({
      where: {
        clientId,
        inTaskManager: true,
        ...(visible ? { id: { in: visible } } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async listClientInvoices(clientId: string, q: string): Promise<MentionInvoiceCandidateDto[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        clientId,
        ...(q
          ? {
              OR: [
                { displayNumber: { contains: q, mode: 'insensitive' } },
                { billToName: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, displayNumber: true, billToName: true, total: true, issueDate: true },
      orderBy: { issueDate: 'desc' },
      take: 15,
    });
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return rows.map((row) => ({
      kind: 'invoice',
      id: `invoice:${row.id}`,
      label: row.displayNumber,
      detail: [row.billToName?.trim(), money.format(Number(row.total)), date.format(row.issueDate)]
        .filter(Boolean)
        .join(' · '),
    }));
  }

  private async listClientTmProjects(
    user: UserContext,
    clientId: string,
    q: string,
  ): Promise<MentionProjectCandidateDto[]> {
    const visible = await this.taskAccess.visibleProjectIds(user);
    const projects = await this.prisma.project.findMany({
      where: {
        clientId,
        inTaskManager: true,
        ...(visible ? { id: { in: visible } } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });
    const clientName = projects[0]?.client?.name ?? null;
    return projects.map((p) => ({
      kind: 'project',
      id: `project:${p.id}`,
      label: p.name,
      clientName,
    }));
  }

  private async listClientCrmProjects(clientId: string, q: string): Promise<MentionCrmProjectCandidateDto[]> {
    const rows = await this.prisma.project.findMany({
      where: {
        clientId,
        inTaskManager: false,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    const clientName = rows[0]?.client?.name ?? null;
    return rows.map((p) => ({
      kind: 'crmProject',
      id: `crmProject:${p.id}`,
      label: p.name,
      clientName,
    }));
  }

  private async listClientTasksSearch(
    user: UserContext,
    clientId: string,
    qRaw: string,
  ): Promise<MentionTaskCandidateDto[]> {
    const q = qRaw.trim().toLowerCase();
    if (q.length < ACTIVITY_TASK_MIN_QUERY_CHARS) return [];

    const projectIds = await this.clientTmProjectIds(user, clientId);
    if (!projectIds.length) return [];

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        name: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, name: true, projectId: true, project: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });
    return tasks.map((t) => ({
      kind: 'task',
      id: `task:${t.id}`,
      label: t.name,
      projectId: t.projectId,
      projectName: t.project.name,
    }));
  }

  private async listClientContacts(clientId: string, q: string): Promise<MentionContactCandidateDto[]> {
    const rows = await this.prisma.contact.findMany({
      where: {
        tenantId: TENANT,
        accountLinks: { some: { clientId } },
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { emails: { some: { email: { contains: q, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 40,
    });
    return rows.map((c) => {
      const email = (c.emails.find((e) => e.isPrimary) ?? c.emails[0])?.email?.trim() ?? null;
      const label = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || email || 'Contact';
      return {
        kind: 'contact',
        id: `contact:${c.id}`,
        label,
        email,
      };
    });
  }

  private async listTasksInProject(projectId: string, q: string): Promise<MentionTaskCandidateDto[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) return [];

    const rows = await this.prisma.task.findMany({
      where: {
        projectId,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, projectId: true },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    return rows.map((row) => ({
      kind: 'task',
      id: `task:${row.id}`,
      label: row.name,
      projectId: row.projectId,
      projectName: project.name,
    }));
  }

  private async listClientTaskProjects(
    user: UserContext,
    clientId: string,
    q: string,
  ): Promise<(MentionTaskCandidateDto | MentionProjectCandidateDto)[]> {
    const visible = await this.taskAccess.visibleProjectIds(user);
    const where: Prisma.ProjectWhereInput = {
      clientId,
      inTaskManager: true,
      ...(visible ? { id: { in: visible } } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    };
    const projects = await this.prisma.project.findMany({
      where,
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 15,
    });
    const clientName = projects[0]?.client?.name ?? null;
    const projectCandidates: MentionProjectCandidateDto[] = projects.map((p) => ({
      kind: 'project',
      id: `project:${p.id}`,
      label: p.name,
      clientName,
    }));

    const projectIds = projects.map((p) => p.id);
    if (!projectIds.length) return projectCandidates;

    const tasks = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, projectId: true, project: { select: { name: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
    const taskCandidates: MentionTaskCandidateDto[] = tasks.map((t) => ({
      kind: 'task',
      id: `task:${t.id}`,
      label: t.name,
      projectId: t.projectId,
      projectName: t.project.name,
    }));

    return [...projectCandidates, ...taskCandidates];
  }

  private toUserCandidate(user: Parameters<typeof person>[0]): MentionUserCandidateDto {
    const dto = person(user);
    return {
      kind: 'user',
      id: `user:${dto.id}`,
      label: dto.name,
      firstName: dto.firstName ?? '',
      lastName: dto.lastName,
      email: dto.email,
      avatarUrl: dto.avatarUrl,
    };
  }

  private mergeAndRankActivity(candidates: MentionCandidateDto[], q: string, take: number): MentionCandidateDto[] {
    const users: MentionCandidateDto[] = [];
    const contacts: MentionCandidateDto[] = [];
    const invoices: MentionCandidateDto[] = [];
    const tmProjects: MentionCandidateDto[] = [];
    const crmProjects: MentionCandidateDto[] = [];
    const tasks: MentionCandidateDto[] = [];
    for (const c of candidates) {
      switch (c.kind) {
        case 'user':
          users.push(c);
          break;
        case 'contact':
          contacts.push(c);
          break;
        case 'invoice':
          invoices.push(c);
          break;
        case 'project':
          tmProjects.push(c);
          break;
        case 'crmProject':
          crmProjects.push(c);
          break;
        case 'task':
          tasks.push(c);
          break;
      }
    }
    const people = this.sortMentionBucket([...users, ...contacts], q);
    const projects = this.sortMentionBucket([...tmProjects, ...crmProjects], q);
    return [
      ...people,
      ...this.sortMentionBucket(invoices, q),
      ...projects,
      ...this.sortMentionBucket(tasks, q),
    ].slice(0, take);
  }

  private mergeAndRank(candidates: MentionCandidateDto[], q: string, take: number): MentionCandidateDto[] {
    const users: MentionCandidateDto[] = [];
    const contacts: MentionCandidateDto[] = [];
    const tasks: MentionCandidateDto[] = [];
    const projects: MentionCandidateDto[] = [];
    for (const c of candidates) {
      switch (c.kind) {
        case 'user':
          users.push(c);
          break;
        case 'contact':
          contacts.push(c);
          break;
        case 'task':
          tasks.push(c);
          break;
        case 'project':
          projects.push(c);
          break;
      }
    }
    const people = this.sortMentionBucket([...users, ...contacts], q);
    return [...people, ...this.sortMentionBucket(tasks, q), ...this.sortMentionBucket(projects, q)].slice(
      0,
      take,
    );
  }

  private sortMentionBucket(items: MentionCandidateDto[], q: string): MentionCandidateDto[] {
    return [...items].sort((a, b) => {
      const byRank = this.rankLabel(a.label, q) - this.rankLabel(b.label, q);
      if (byRank !== 0) return byRank;
      return a.label.localeCompare(b.label);
    });
  }

  private rankLabel(label: string, q: string): number {
    if (!q) return 0;
    const idx = label.toLowerCase().indexOf(q);
    return idx === -1 ? 1000 : idx;
  }
}
