import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isStaffRole } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { AddTaskTagDto, CreateTagDto, UpdateTagDto } from './dto/task-manager.dto';
import { TaskAccessService } from './task-access.service';
import { OPTION_COLORS } from './task-fields.util';

const tagKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const tagSelect = { id: true, name: true, color: true } as const;

/** Tags shared across every project. Anyone in Tasks can create/apply them; staff rename and delete. */
@Injectable()
export class TaskTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  async list() {
    const rows = await this.prisma.tag.findMany({
      select: { ...tagSelect, _count: { select: { tasks: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, taskCount: _count.tasks }));
  }

  /** Create, or return the existing tag with the same name (case-insensitive). */
  async create(dto: CreateTagDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Tag name is required');
    const nameKey = tagKey(name);
    const existing = await this.prisma.tag.findUnique({ where: { nameKey }, select: tagSelect });
    if (existing) return existing;
    const count = await this.prisma.tag.count();
    return this.prisma.tag.create({
      data: { name, nameKey, color: dto.color || OPTION_COLORS[count % OPTION_COLORS.length] },
      select: tagSelect,
    });
  }

  async update(user: UserContext, id: string, dto: UpdateTagDto) {
    if (!isStaffRole(user.role)) throw new ForbiddenException('Only staff can edit tags');
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    const data: { name?: string; nameKey?: string; color?: string | null } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      const nameKey = tagKey(name);
      const clash = await this.prisma.tag.findUnique({ where: { nameKey } });
      if (clash && clash.id !== id) throw new BadRequestException(`There's already a tag named "${clash.name}"`);
      data.name = name;
      data.nameKey = nameKey;
    }
    if (dto.color !== undefined) data.color = dto.color;
    return this.prisma.tag.update({ where: { id }, data, select: tagSelect });
  }

  async remove(user: UserContext, id: string) {
    if (!isStaffRole(user.role)) throw new ForbiddenException('Only staff can delete tags');
    await this.prisma.tag.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Tag not found');
    });
    return { deleted: true };
  }

  async addToTask(user: UserContext, taskId: string, dto: AddTaskTagDto) {
    await this.access.assertTask(user, taskId, 'edit');
    let tagId = dto.tagId;
    if (!tagId) {
      if (!dto.name) throw new BadRequestException('tagId or name is required');
      tagId = (await this.create({ name: dto.name, color: dto.color })).id;
    } else if (!(await this.prisma.tag.count({ where: { id: tagId } }))) {
      throw new NotFoundException('Tag not found');
    }
    await this.prisma.taskTag.upsert({
      where: { taskId_tagId: { taskId, tagId } },
      create: { taskId, tagId },
      update: {},
    });
    return this.taskTags(taskId);
  }

  async removeFromTask(user: UserContext, taskId: string, tagId: string) {
    await this.access.assertTask(user, taskId, 'edit');
    await this.prisma.taskTag.deleteMany({ where: { taskId, tagId } });
    return this.taskTags(taskId);
  }

  private async taskTags(taskId: string) {
    const rows = await this.prisma.taskTag.findMany({ where: { taskId }, select: { tag: { select: tagSelect } } });
    return rows.map((r) => r.tag).sort((a, b) => a.name.localeCompare(b.name));
  }
}
