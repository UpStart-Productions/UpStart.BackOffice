import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLaneDto, UpdateLaneDto } from './dto/pipelines.dto';
import { ensurePipelines, laneFields, STARTER_LANES } from './pipeline-lanes.util';

/**
 * Tenant-defined relationship pipelines and their lanes. There are no won/lost stages; cards move
 * by hand, become clients with Make client, and leave the board only when archived.
 */
@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every pipeline with its lanes in order and how many active (not archived) cards each lane holds. */
  async list() {
    await ensurePipelines(this.prisma);
    const pipelines = await this.prisma.pipeline.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        stages: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            color: true,
            sortOrder: true,
            _count: { select: { leads: { where: { archivedAt: null } } } },
          },
        },
      },
    });
    return pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      sortOrder: p.sortOrder,
      stages: p.stages.map(({ _count, ...s }) => ({ ...s, cardCount: _count.leads })),
    }));
  }

  async createPipeline(name: string) {
    const last = await this.prisma.pipeline.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    // A new pipeline starts with the starter lane names (no legacy links); edit them on the board.
    return this.prisma.pipeline.create({
      data: {
        name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        stages: { create: STARTER_LANES.map((l, i) => ({ name: l.name, color: l.color, sortOrder: i })) },
      },
      select: { id: true, name: true },
    });
  }

  async renamePipeline(id: string, name: string) {
    await this.requirePipeline(id);
    return this.prisma.pipeline.update({ where: { id }, data: { name }, select: { id: true, name: true } });
  }

  /** Only an empty pipeline can be deleted, and never the last one. */
  async deletePipeline(id: string) {
    await this.requirePipeline(id);
    if ((await this.prisma.pipeline.count()) <= 1) throw new BadRequestException('You need at least one pipeline.');
    const cards = await this.prisma.lead.count({ where: { pipelineId: id } });
    if (cards) throw new ConflictException(`Move or delete the ${cards} card${cards === 1 ? '' : 's'} in this pipeline first (archived cards count too).`);
    await this.prisma.pipeline.delete({ where: { id } });
    return { deleted: true };
  }

  /** Add a lane at the end of a pipeline. */
  async addLane(pipelineId: string, dto: CreateLaneDto) {
    await this.requirePipeline(pipelineId);
    const last = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.pipelineStage.create({
      data: { pipelineId, name: dto.name, color: dto.color ?? null, sortOrder: (last?.sortOrder ?? -1) + 1 },
      select: { id: true, name: true, color: true, sortOrder: true },
    });
  }

  async updateLane(stageId: string, dto: UpdateLaneDto) {
    await this.requireLane(stageId);
    return this.prisma.pipelineStage.update({
      where: { id: stageId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color || null }),
      },
      select: { id: true, name: true, color: true, sortOrder: true },
    });
  }

  /** Set the lane order. The list must name every lane of the pipeline exactly once. */
  async reorderLanes(pipelineId: string, stageIds: string[]) {
    await this.requirePipeline(pipelineId);
    const lanes = await this.prisma.pipelineStage.findMany({ where: { pipelineId }, select: { id: true } });
    const have = new Set(lanes.map((l) => l.id));
    if (stageIds.length !== have.size || new Set(stageIds).size !== have.size || stageIds.some((id) => !have.has(id))) {
      throw new BadRequestException('Send every lane of this pipeline exactly once.');
    }
    await this.prisma.$transaction(
      stageIds.map((id, i) => this.prisma.pipelineStage.update({ where: { id }, data: { sortOrder: i } })),
    );
    return { ok: true };
  }

  /**
   * Remove a lane. If it holds cards (archived ones included), `moveToStageId` says where they go;
   * booking types that used the lane follow them. A pipeline's last lane can't be removed.
   */
  async deleteLane(stageId: string, moveToStageId?: string) {
    const lane = await this.requireLane(stageId);
    const siblings = await this.prisma.pipelineStage.count({ where: { pipelineId: lane.pipelineId } });
    if (siblings <= 1) throw new BadRequestException("A pipeline needs at least one lane.");

    const cards = await this.prisma.lead.count({ where: { stageId } });
    let target: { id: string; pipelineId: string; legacyKey: typeof lane.legacyKey } | null = null;
    if (moveToStageId) {
      if (moveToStageId === stageId) throw new BadRequestException('Pick a different lane to move the cards to.');
      target = await this.prisma.pipelineStage.findUnique({
        where: { id: moveToStageId },
        select: { id: true, pipelineId: true, legacyKey: true },
      });
      if (!target) throw new NotFoundException('Lane to move cards to not found.');
    } else if (cards) {
      throw new ConflictException({ message: `This lane has ${cards} card${cards === 1 ? '' : 's'}. Choose a lane to move them to.`, cards });
    }

    await this.prisma.$transaction(async (tx) => {
      if (target) {
        await tx.lead.updateMany({
          where: { stageId },
          data: laneFields({ pipelineId: target.pipelineId, stageId: target.id, legacyKey: target.legacyKey }),
        });
        await tx.bookingType.updateMany({ where: { leadStageId: stageId }, data: { leadStageId: target.id } });
      }
      await tx.pipelineStage.delete({ where: { id: stageId } });
    });
    return { deleted: true, moved: target ? cards : 0 };
  }

  private async requirePipeline(id: string) {
    const p = await this.prisma.pipeline.findUnique({ where: { id }, select: { id: true } });
    if (!p) throw new NotFoundException('Pipeline not found');
    return p;
  }

  private async requireLane(id: string) {
    const s = await this.prisma.pipelineStage.findUnique({
      where: { id },
      select: { id: true, pipelineId: true, legacyKey: true },
    });
    if (!s) throw new NotFoundException('Lane not found');
    return s;
  }
}
