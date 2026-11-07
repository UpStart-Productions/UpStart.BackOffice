import { BadRequestException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped } from '../tenancy/tenant-context';
import { person } from '../task-manager/task-mappers';
import { PersonDto, personSelect } from '../task-manager/task-people.util';

/**
 * Staff on a client or project, shown in the People panel next to the organization's contacts.
 *  - Project staff are its members (ProjectMember), the same list as its task board.
 *  - Client staff are its assignments (ClientAssignment, which also decides reach for "own" roles),
 *    plus everyone on the client's projects (shown only; that doesn't assign them to the client).
 * Staff are never invoice recipients: those are the project's contacts.
 */

export class AddTeamMemberDto {
  @IsString() userId!: string;
  /** Projects only: add them as the Lead instead of a Member. */
  @IsOptional() @IsBoolean() isLead?: boolean;
}

export class InviteTeamMemberDto {
  @IsString() email!: string;
  /** Lead (ProjectMember OWNER) or Member (EDITOR). */
  @IsOptional() @IsBoolean() isLead?: boolean;
}

export class UpdateTeamMemberDto {
  /** Lead (ProjectMember OWNER) or Member (EDITOR). */
  @IsBoolean() isLead!: boolean;
}

export type TeamMemberDto = PersonDto & {
  /** True when removable here (on the project, or assigned to the client directly). */
  direct: boolean;
  /** Client panel: the client's projects this person is on. */
  projects: { id: string; name: string }[];
  /** Project panel: this person is the project's Lead (sees everyone's time, expenses and invoices on it). */
  isLead?: boolean;
};

/** Anyone in the tenant who can be put on a client or project (not portal users). A super user also sees themselves. */
export async function teamCandidates(prisma: PrismaService, user: UserContext): Promise<PersonDto[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'USER'] } },
    select: personSelect,
    orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
  });
  if (user.isSuper && !users.some((u) => u.id === user.id)) {
    const self = await runUnscoped(() => prisma.user.findUnique({ where: { id: user.id }, select: personSelect }));
    if (self) users.push(self);
  }
  return users.map(person);
}

/** The user to add, or 400. A super user may add themselves (their row belongs to no tenant). */
export async function assertTeamCandidate(prisma: PrismaService, user: UserContext, userId: string): Promise<void> {
  const find = () =>
    prisma.user.findFirst({ where: { id: userId, isActive: true, role: { in: ['ADMIN', 'USER'] } }, select: { id: true } });
  const found = user.isSuper && userId === user.id ? await runUnscoped(find) : await find();
  if (!found) throw new BadRequestException('That person is not on your team');
}

export async function projectTeam(prisma: PrismaService, projectId: string): Promise<TeamMemberDto[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { ...personSelect, isActive: true } } },
  });
  return sortTeam(rows.filter((r) => r.user.isActive).map((r) => ({ ...person(r.user), direct: true, projects: [], isLead: r.role === 'OWNER' })));
}

export async function clientTeam(prisma: PrismaService, clientId: string): Promise<TeamMemberDto[]> {
  const [assigned, onProjects] = await Promise.all([
    prisma.clientAssignment.findMany({ where: { clientId }, include: { user: { select: { ...personSelect, isActive: true } } } }),
    prisma.projectMember.findMany({
      where: { project: { clientId } },
      include: {
        user: { select: { ...personSelect, isActive: true } },
        project: { select: { id: true, name: true } },
      },
    }),
  ]);
  const byId = new Map<string, TeamMemberDto>();
  for (const a of assigned) {
    if (a.user.isActive) byId.set(a.userId, { ...person(a.user), direct: true, projects: [] });
  }
  for (const m of onProjects) {
    if (!m.user.isActive) continue;
    const row = byId.get(m.userId) ?? { ...person(m.user), direct: false, projects: [] };
    row.projects.push({ id: m.project.id, name: m.project.name });
    byId.set(m.userId, row);
  }
  for (const row of byId.values()) row.projects.sort((a, b) => a.name.localeCompare(b.name));
  return sortTeam([...byId.values()]);
}

function sortTeam(rows: TeamMemberDto[]): TeamMemberDto[] {
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
