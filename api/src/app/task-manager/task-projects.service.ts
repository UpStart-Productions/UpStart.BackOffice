import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectMemberRole } from '@prisma/client';
import { isStaffRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddMemberDto,
  CreateFieldDto,
  CreateSectionDto,
  UpdateFieldDto,
  UpdateSectionDto,
  UpdateTmProjectDto,
} from './dto/task-manager.dto';
import { TaskAccessService } from './task-access.service';
import { projectRoute } from './task-events.service';
import { normalizeOptions } from './task-fields.util';
import { person, toField } from './task-mappers';
import { ORDER_STEP, orderBetween, renumber } from './task-order.util';
import { personName, personSelect } from './task-people.util';

export const DEFAULT_SECTIONS = ['To do', 'Doing', 'Done'];
export const PROJECT_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#ea580c', '#dc2626', '#db2777', '#64748b'];

@Injectable()
export class TaskProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  async list(user: UserContext, includeArchived = false) {
    const visible = await this.access.visibleProjectIds(user);
    const projects = await this.prisma.project.findMany({
      where: {
        inTaskManager: true,
        ...(visible ? { id: { in: visible } } : {}),
        ...(includeArchived ? {} : { isActive: true }),
      },
      select: {
        id: true,
        name: true,
        color: true,
        isActive: true,
        isBillable: true,
        client: { select: { id: true, name: true } },
        stars: { where: { userId: user.id }, select: { sortOrder: true } },
        members: { where: { userId: user.id }, select: { role: true } },
        _count: { select: { members: true, workTasks: { where: { isCompleted: false, parentTaskId: null } } } },
      },
      orderBy: { name: 'asc' },
    });
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isActive: p.isActive,
      isBillable: p.isBillable,
      client: p.client,
      isStarred: p.stars.length > 0,
      starOrder: p.stars[0]?.sortOrder ?? null,
      myRole: p.members[0]?.role ?? null,
      memberCount: p._count.members,
      openTaskCount: p._count.workTasks,
    }));
  }

  async get(user: UserContext, projectId: string) {
    await this.access.assertProject(user, projectId, 'view');
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        client: { select: { id: true, name: true } },
        sections: { orderBy: { sortOrder: 'asc' } },
        customFields: { orderBy: { sortOrder: 'asc' } },
        members: { include: { user: { select: personSelect } }, orderBy: { createdAt: 'asc' } },
        stars: { where: { userId: user.id }, select: { id: true } },
      },
    });
    const [canEdit, canComment, canManage] = await Promise.all([
      this.access.can(user, projectId, 'edit'),
      this.access.can(user, projectId, 'comment'),
      this.access.can(user, projectId, 'manage'),
    ]);
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      isActive: project.isActive,
      isBillable: project.isBillable,
      client: project.client,
      isStarred: project.stars.length > 0,
      sections: project.sections.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        isCollapsed: s.isCollapsed,
      })),
      customFields: project.customFields.map(toField),
      members: project.members.map((m) => ({ ...person(m.user), memberRole: m.role })),
      permissions: { canEdit, canComment, canManage, isStaff: isStaffRole(user.role) },
    };
  }

  /** Active projects (from the Projects page) not yet added to Tasks. Staff only. */
  async available(user: UserContext) {
    if (!isStaffRole(user.role)) return [];
    return this.prisma.project.findMany({
      where: { inTaskManager: false, isActive: true },
      select: { id: true, name: true, client: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Add an existing project to Tasks. Projects are created on the Projects page;
   * Tasks never creates them. First add seeds default sections and makes the adder owner.
   */
  async addToTaskManager(user: UserContext, projectId: string, color?: string | null) {
    if (!isStaffRole(user.role)) throw new BadRequestException('Only staff can add projects to Tasks');
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, color: true, _count: { select: { sections: true, members: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    const enabledCount = await this.prisma.project.count({ where: { inTaskManager: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: {
          inTaskManager: true,
          color: color || project.color || PROJECT_COLORS[enabledCount % PROJECT_COLORS.length],
        },
      });
      if (project._count.sections === 0) {
        await tx.taskSection.createMany({
          data: DEFAULT_SECTIONS.map((name, i) => ({ projectId, name, sortOrder: (i + 1) * ORDER_STEP })),
        });
      }
      if (project._count.members === 0) {
        await tx.projectMember.create({ data: { projectId, userId: user.id, role: ProjectMemberRole.OWNER } });
      }
    });
    return this.get(user, projectId);
  }

  /** Hide a project from Tasks. Its tasks, sections and members are kept for if it's added back. */
  async removeFromTaskManager(user: UserContext, projectId: string) {
    await this.access.assertProject(user, projectId, 'manage');
    await this.prisma.project.update({ where: { id: projectId }, data: { inTaskManager: false } });
    return { removed: true };
  }

  async update(user: UserContext, projectId: string, dto: UpdateTmProjectDto) {
    await this.access.assertProject(user, projectId, 'edit');
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
    return this.get(user, projectId);
  }

  async setStar(user: UserContext, projectId: string, starred: boolean) {
    await this.access.assertProject(user, projectId, 'view');
    if (starred) {
      const last = await this.prisma.projectStar.findFirst({
        where: { userId: user.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await this.prisma.projectStar.upsert({
        where: { projectId_userId: { projectId, userId: user.id } },
        create: { projectId, userId: user.id, sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP },
        update: {},
      });
    } else {
      await this.prisma.projectStar.deleteMany({ where: { projectId, userId: user.id } });
    }
    return { starred };
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async addMember(user: UserContext, projectId: string, dto: AddMemberDto) {
    await this.access.assertProject(user, projectId, 'manage');
    const target = await this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, role: true, isActive: true } });
    if (!target || !target.isActive) throw new NotFoundException('User not found');
    if (target.role === 'CLIENT') throw new BadRequestException('Client portal users cannot join Task Manager projects');
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('Already a member');
    await this.prisma.projectMember.create({
      data: { projectId, userId: dto.userId, role: dto.role ?? ProjectMemberRole.EDITOR },
    });
    if (dto.userId !== user.id) {
      const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true } });
      await this.delivery.deliver({
        userId: dto.userId,
        type: 'project_added',
        title: `${personName(user)} added you to ${project.name}`,
        meta: {
          entityType: 'project',
          entityId: projectId,
          route: projectRoute(projectId),
          actorUserId: user.id,
          actorLabel: personName(user),
          projectId,
          projectName: project.name,
        },
      });
    }
    return this.get(user, projectId);
  }

  async updateMember(user: UserContext, projectId: string, userId: string, role: ProjectMemberRole) {
    await this.access.assertProject(user, projectId, 'manage');
    const result = await this.prisma.projectMember.updateMany({ where: { projectId, userId }, data: { role } });
    if (result.count === 0) throw new NotFoundException('Member not found');
    return this.get(user, projectId);
  }

  async removeMember(user: UserContext, projectId: string, userId: string) {
    // Anyone may leave a project; removing others requires manage.
    if (userId !== user.id) await this.access.assertProject(user, projectId, 'manage');
    await this.prisma.projectMember.deleteMany({ where: { projectId, userId } });
    return { removed: true };
  }

  /** People who can be assigned / @mentioned in a project: staff + project members. */
  async people(user: UserContext, projectId?: string) {
    if (projectId) await this.access.assertProject(user, projectId, 'view');
    const where: Prisma.UserWhereInput = projectId
      ? {
          isActive: true,
          OR: [{ role: { in: ['ADMIN', 'MEMBER'] } }, { projectMemberships: { some: { projectId } } }],
        }
      : isStaffRole(user.role)
        ? { isActive: true, role: { in: ['ADMIN', 'MEMBER', 'GUEST'] } }
        : { isActive: true, OR: [{ role: { in: ['ADMIN', 'MEMBER'] } }, { id: user.id }] };
    const users = await this.prisma.user.findMany({ where, select: personSelect, orderBy: [{ firstName: 'asc' }, { email: 'asc' }] });
    return users.map(person);
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  async createSection(user: UserContext, projectId: string, dto: CreateSectionDto) {
    await this.access.assertProject(user, projectId, 'edit');
    const sortOrder = await this.sectionOrderAfter(projectId, dto.afterSectionId);
    const section = await this.prisma.taskSection.create({ data: { projectId, name: dto.name, sortOrder } });
    return { id: section.id, name: section.name, sortOrder: section.sortOrder, isCollapsed: section.isCollapsed };
  }

  async updateSection(user: UserContext, sectionId: string, dto: UpdateSectionDto) {
    const section = await this.findSection(sectionId);
    await this.access.assertProject(user, section.projectId, dto.name !== undefined ? 'edit' : 'view');
    const updated = await this.prisma.taskSection.update({
      where: { id: sectionId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isCollapsed !== undefined && { isCollapsed: dto.isCollapsed }),
      },
    });
    return { id: updated.id, name: updated.name, sortOrder: updated.sortOrder, isCollapsed: updated.isCollapsed };
  }

  async moveSection(user: UserContext, sectionId: string, afterSectionId: string | null | undefined) {
    const section = await this.findSection(sectionId);
    await this.access.assertProject(user, section.projectId, 'edit');
    if (afterSectionId === sectionId) return { id: sectionId, sortOrder: section.sortOrder };
    const sortOrder = await this.sectionOrderAfter(section.projectId, afterSectionId ?? null, sectionId);
    await this.prisma.taskSection.update({ where: { id: sectionId }, data: { sortOrder } });
    return { id: sectionId, sortOrder };
  }

  /** Delete a section; its tasks move to the previous (or next) section. */
  async deleteSection(user: UserContext, sectionId: string) {
    const section = await this.findSection(sectionId);
    await this.access.assertProject(user, section.projectId, 'edit');
    const siblings = await this.prisma.taskSection.findMany({
      where: { projectId: section.projectId, id: { not: sectionId } },
      orderBy: { sortOrder: 'asc' },
    });
    const target =
      [...siblings].reverse().find((s) => s.sortOrder < section.sortOrder) ?? siblings[0] ?? null;
    await this.prisma.$transaction(async (tx) => {
      if (target) {
        const last = await tx.task.findFirst({
          where: { sectionId: target.id, parentTaskId: null },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        });
        const moving = await tx.task.findMany({
          where: { sectionId, parentTaskId: null },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
        let order = last?.sortOrder ?? 0;
        for (const t of moving) {
          order += ORDER_STEP;
          await tx.task.update({ where: { id: t.id }, data: { sectionId: target.id, sortOrder: order } });
        }
      }
      await tx.taskSection.delete({ where: { id: sectionId } });
    });
    return { deleted: true, movedToSectionId: target?.id ?? null };
  }

  private async findSection(sectionId: string) {
    const section = await this.prisma.taskSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  private async sectionOrderAfter(projectId: string, afterSectionId: string | null | undefined, excludeId?: string) {
    const sections = await this.prisma.taskSection.findMany({
      where: { projectId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, sortOrder: true },
    });
    if (afterSectionId === undefined) return (sections.at(-1)?.sortOrder ?? 0) + ORDER_STEP;
    const index = afterSectionId === null ? -1 : sections.findIndex((s) => s.id === afterSectionId);
    if (afterSectionId !== null && index < 0) throw new NotFoundException('Section not found');
    const before = index >= 0 ? sections[index].sortOrder : null;
    const after = sections[index + 1]?.sortOrder ?? null;
    const order = orderBetween(before, after);
    if (order !== null) return order;
    // Gap exhausted — renumber then retry.
    await this.prisma.$transaction(
      renumber(sections).map((r) => this.prisma.taskSection.update({ where: { id: r.id }, data: { sortOrder: r.sortOrder } })),
    );
    return (index + 1) * ORDER_STEP + ORDER_STEP / 2;
  }

  // ── Custom fields ─────────────────────────────────────────────────────────

  async createField(user: UserContext, projectId: string, dto: CreateFieldDto) {
    await this.access.assertProject(user, projectId, 'edit');
    const last = await this.prisma.taskCustomField.findFirst({
      where: { projectId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const isSelect = dto.type === 'SINGLE_SELECT' || dto.type === 'MULTI_SELECT';
    const field = await this.prisma.taskCustomField.create({
      data: {
        projectId,
        name: dto.name,
        type: dto.type,
        options: isSelect ? (normalizeOptions(dto.options) as Prisma.InputJsonValue) : Prisma.JsonNull,
        sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP,
      },
    });
    return toField(field);
  }

  async updateField(user: UserContext, fieldId: string, dto: UpdateFieldDto) {
    const field = await this.prisma.taskCustomField.findUnique({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('Field not found');
    await this.access.assertProject(user, field.projectId, 'edit');
    const isSelect = field.type === 'SINGLE_SELECT' || field.type === 'MULTI_SELECT';
    const updated = await this.prisma.taskCustomField.update({
      where: { id: fieldId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.options !== undefined && isSelect && { options: normalizeOptions(dto.options) as Prisma.InputJsonValue }),
      },
    });
    return toField(updated);
  }

  async deleteField(user: UserContext, fieldId: string) {
    const field = await this.prisma.taskCustomField.findUnique({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('Field not found');
    await this.access.assertProject(user, field.projectId, 'edit');
    await this.prisma.taskCustomField.delete({ where: { id: fieldId } });
    return { deleted: true };
  }
}
