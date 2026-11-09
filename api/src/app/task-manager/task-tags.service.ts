import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DIMENSION_TAG_KEY } from '@upstart/back-office/shared';
import { UserContext } from '../common/app.types';
import { getRecordDimensionValues, setRecordDimensions } from '../dimensions/dimensions.util';
import { tagsByNames } from '../dimensions/tag-catalog.util';
import { currentTenantId } from '../tenancy/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { AddTaskTagDto, CreateTagDto, UpdateTagDto } from './dto/task-manager.dto';
import { TaskAccessService } from './task-access.service';
import { OPTION_COLORS } from './task-fields.util';

const tagKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const tagSelect = { id: true, name: true, color: true } as const;

/** Tags shared across every project. Anyone in Tasks can create/apply them; people who see every project rename and delete. */
@Injectable()
export class TaskTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  async list() {
    const rows = await this.prisma.tag.findMany({
      where: { scope: 'TASK' },
      select: tagSelect,
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.$queryRaw<Array<{ name: string; cnt: number }>>(Prisma.sql`
      SELECT v AS name, COUNT(DISTINCT dv."recordId")::int AS cnt
      FROM "DimensionValue" dv
      INNER JOIN "DimensionDefinition" dd ON dd."id" = dv."definitionId"
      CROSS JOIN LATERAL unnest(dv."values") AS v
      WHERE dd."entity" = 'TASK'::"DimensionEntity"
        AND dd."key" = ${DIMENSION_TAG_KEY}
      GROUP BY v
    `);
    const countByName = new Map(counts.map((c) => [c.name.toLowerCase(), c.cnt]));
    return rows.map((t) => ({ ...t, taskCount: countByName.get(t.name.toLowerCase()) ?? 0 }));
  }

  /** Create, or return the existing tag with the same name (case-insensitive). */
  async create(dto: CreateTagDto) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Tag name is required');
    const nameKey = tagKey(name);
    const existing = await this.prisma.tag.findFirst({ where: { scope: 'TASK', nameKey }, select: tagSelect });
    if (existing) return existing;
    const count = await this.prisma.tag.count({ where: { scope: 'TASK' } });
    return this.prisma.tag.create({
      data: { name, nameKey, color: dto.color || OPTION_COLORS[count % OPTION_COLORS.length] },
      select: tagSelect,
    });
  }

  async update(user: UserContext, id: string, dto: UpdateTagDto) {
    if (!this.access.seesAllProjects(user)) throw new ForbiddenException('You do not have permission to edit tags');
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag || tag.scope !== 'TASK') throw new NotFoundException('Tag not found');
    const data: { name?: string; nameKey?: string; color?: string | null } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      const nameKey = tagKey(name);
      const clash = await this.prisma.tag.findFirst({ where: { scope: 'TASK', nameKey } });
      if (clash && clash.id !== id) throw new BadRequestException(`There's already a tag named "${clash.name}"`);
      data.name = name;
      data.nameKey = nameKey;
    }
    if (dto.color !== undefined) data.color = dto.color;
    return this.prisma.tag.update({ where: { id }, data, select: tagSelect });
  }

  async remove(user: UserContext, id: string) {
    if (!this.access.seesAllProjects(user)) throw new ForbiddenException('You do not have permission to delete tags');
    await this.prisma.tag.delete({ where: { id, scope: 'TASK' } }).catch(() => {
      throw new NotFoundException('Tag not found');
    });
    return { deleted: true };
  }

  async addToTask(user: UserContext, taskId: string, dto: AddTaskTagDto) {
    await this.access.assertTask(user, taskId, 'edit');
    const tenantId = currentTenantId();
    let name: string | null = null;
    if (dto.tagId) {
      const tag = await this.prisma.tag.findFirst({ where: { id: dto.tagId, scope: 'TASK' }, select: { name: true } });
      if (!tag) throw new NotFoundException('Tag not found');
      name = tag.name;
    } else if (dto.name) {
      name = (await this.create({ name: dto.name, color: dto.color })).name;
    } else {
      throw new BadRequestException('tagId or name is required');
    }
    const current = await getRecordDimensionValues(this.prisma, 'TASK', taskId, DIMENSION_TAG_KEY);
    if (!current.some((n) => n.toLowerCase() === name!.toLowerCase())) {
      await setRecordDimensions(this.prisma, tenantId, 'TASK', taskId, { [DIMENSION_TAG_KEY]: [...current, name] });
    }
    return this.taskTags(taskId);
  }

  async removeFromTask(user: UserContext, taskId: string, tagId: string) {
    await this.access.assertTask(user, taskId, 'edit');
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, scope: 'TASK' }, select: { name: true } });
    if (!tag) throw new NotFoundException('Tag not found');
    const tenantId = currentTenantId();
    const current = await getRecordDimensionValues(this.prisma, 'TASK', taskId, DIMENSION_TAG_KEY);
    const next = current.filter((n) => n.toLowerCase() !== tag.name.toLowerCase());
    await setRecordDimensions(this.prisma, tenantId, 'TASK', taskId, { [DIMENSION_TAG_KEY]: next });
    return this.taskTags(taskId);
  }

  private async taskTags(taskId: string) {
    const names = await getRecordDimensionValues(this.prisma, 'TASK', taskId, DIMENSION_TAG_KEY);
    return tagsByNames(this.prisma, 'TASK', names);
  }
}
