import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { isAdminRole, isStaffRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';

export type ProjectPermission = 'view' | 'comment' | 'edit' | 'manage';

const ROLE_RANK: Record<ProjectMemberRole, number> = { COMMENTER: 1, EDITOR: 2, OWNER: 3 };
const NEED_RANK: Record<ProjectPermission, number> = { view: 1, comment: 1, edit: 2, manage: 3 };

/**
 * Who can see what in the Task Manager.
 * - ADMIN / MEMBER (staff): every project, full edit. Only ADMIN or project OWNER can manage members/settings.
 * - GUEST: only projects where they have a ProjectMember row; permission from the member role.
 */
@Injectable()
export class TaskAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(user: UserContext): boolean {
    return isStaffRole(user.role);
  }

  /** null = all projects (staff). */
  async visibleProjectIds(user: UserContext): Promise<string[] | null> {
    if (this.isStaff(user)) return null;
    const rows = await this.prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  async projectRole(user: UserContext, projectId: string): Promise<ProjectMemberRole | null> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async can(user: UserContext, projectId: string, need: ProjectPermission): Promise<boolean> {
    if (isAdminRole(user.role)) return true;
    const role = await this.projectRole(user, projectId);
    if (this.isStaff(user)) {
      // Staff can do everything except manage, which needs OWNER (or ADMIN above).
      return need !== 'manage' || role === 'OWNER';
    }
    if (!role) return false;
    return ROLE_RANK[role] >= NEED_RANK[need];
  }

  async assertProject(user: UserContext, projectId: string, need: ProjectPermission = 'view'): Promise<void> {
    const exists = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Project not found');
    if (!(await this.can(user, projectId, need))) {
      // Hide existence from guests who aren't members.
      if (need === 'view') throw new NotFoundException('Project not found');
      throw new ForbiddenException('You do not have permission to do that in this project');
    }
  }

  /** Loads the task's projectId and asserts access. Returns projectId. */
  async assertTask(user: UserContext, taskId: string, need: ProjectPermission = 'view'): Promise<string> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertProject(user, task.projectId, need);
    return task.projectId;
  }
}
