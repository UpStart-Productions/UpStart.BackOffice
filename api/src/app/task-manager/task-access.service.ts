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
    const exists = await this.prisma.project.findUnique({ where: { id: projectId }, select: { inTaskManager: true } });
    if (!exists || !exists.inTaskManager) throw new NotFoundException('Project not found in Tasks');
    if (!(await this.can(user, projectId, need))) {
      // Hide existence from guests who aren't members.
      if (need === 'view') throw new NotFoundException('Project not found');
      throw new ForbiddenException('You do not have permission to do that in this project');
    }
  }

  /** Every project a task appears in: home project first, then linked projects (from the top-level ancestor). */
  async taskProjectIds(taskId: string): Promise<{ home: string; all: string[] }> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, parentTaskId: true, projectLinks: { select: { projectId: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    let links = task.projectLinks.map((l) => l.projectId);
    let parentId = task.parentTaskId;
    for (let depth = 0; parentId && depth < 10; depth++) {
      const parent = await this.prisma.task.findUnique({
        where: { id: parentId },
        select: { parentTaskId: true, projectLinks: { select: { projectId: true }, orderBy: { createdAt: 'asc' } } },
      });
      if (!parent) break;
      links = parent.projectLinks.map((l) => l.projectId);
      parentId = parent.parentTaskId;
    }
    return { home: task.projectId, all: [task.projectId, ...links.filter((id) => id !== task.projectId)] };
  }

  /**
   * Asserts access to a task through any project it appears in (home or linked).
   * Returns the task's home projectId.
   */
  async assertTask(user: UserContext, taskId: string, need: ProjectPermission = 'view'): Promise<string> {
    const { home, all } = await this.taskProjectIds(taskId);
    let firstError: unknown = null;
    for (const projectId of all) {
      try {
        await this.assertProject(user, projectId, need);
        return home;
      } catch (err) {
        firstError ??= err;
      }
    }
    throw firstError ?? new NotFoundException('Task not found');
  }

  async canTask(user: UserContext, taskId: string, need: ProjectPermission): Promise<boolean> {
    try {
      await this.assertTask(user, taskId, need);
      return true;
    } catch {
      return false;
    }
  }
}
