import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FREE_FORM_MODULE, normalizeFormSettings } from '@upstart/back-office/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCapturePointDto, UpdateCapturePointDto } from './capture-points.dto';

const SELECT = {
  id: true,
  name: true,
  pipelineId: true,
  stageId: true,
  formId: true,
  isActive: true,
  captureCount: true,
  lastCapturedAt: true,
  createdAt: true,
  pipeline: { select: { name: true } },
  stage: { select: { name: true } },
  form: { select: { name: true } },
} as const;

type Row = { pipeline: { name: string }; stage: { name: string }; form: { name: string } | null } & Record<string, unknown>;
const view = ({ pipeline, stage, form, ...cp }: Row) => ({
  ...cp,
  pipelineName: pipeline.name,
  stageName: stage.name,
  formName: form?.name ?? null,
});

/**
 * Capture points: things put out into the world (website forms, UBO forms, QR codes) that add people to a
 * pipeline lane. They point at the lane by id, so renames never break them.
 */
@Injectable()
export class CapturePointsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { pipelineId?: string; formId?: string } = {}) {
    const rows = await this.prisma.capturePoint.findMany({
      where: { ...(filter.pipelineId && { pipelineId: filter.pipelineId }), ...(filter.formId && { formId: filter.formId }) },
      orderBy: [{ createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map(view);
  }

  async get(id: string) {
    const row = await this.prisma.capturePoint.findUnique({ where: { id }, select: SELECT });
    if (!row) throw new NotFoundException('Capture point not found');
    return view(row);
  }

  async create(dto: CreateCapturePointDto) {
    const lane = await this.lane(dto.stageId);
    if (dto.formId) {
      const form = await this.prisma.form.findUnique({ where: { id: dto.formId }, select: { id: true, module: true, settings: true } });
      if (!form) throw new NotFoundException('Form not found');
      if (form.module !== FREE_FORM_MODULE) throw new BadRequestException('Only forms from the Forms area can send people to a pipeline.');
      if (normalizeFormSettings(form.settings).client.enabled) {
        throw new BadRequestException("This form saves submissions to a client's record. Turn that off to add people to a pipeline.");
      }
      const taken = await this.prisma.capturePoint.findUnique({ where: { formId: dto.formId }, select: { id: true } });
      if (taken) throw new ConflictException('This form already sends people to a pipeline. Change that one instead.');
    }
    const row = await this.prisma.capturePoint.create({
      data: { name: dto.name, pipelineId: lane.pipelineId, stageId: lane.id, formId: dto.formId ?? null, isActive: dto.isActive ?? true },
      select: SELECT,
    });
    return view(row);
  }

  async update(id: string, dto: UpdateCapturePointDto) {
    await this.get(id);
    const lane = dto.stageId ? await this.lane(dto.stageId) : null;
    const row = await this.prisma.capturePoint.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(lane && { pipelineId: lane.pipelineId, stageId: lane.id }),
      },
      select: SELECT,
    });
    return view(row);
  }

  /** Cards it brought in stay put; they just lose the link back to it. */
  async remove(id: string) {
    await this.get(id);
    await this.prisma.capturePoint.delete({ where: { id } });
    return { deleted: true };
  }

  private async lane(stageId: string) {
    const lane = await this.prisma.pipelineStage.findUnique({ where: { id: stageId }, select: { id: true, pipelineId: true } });
    if (!lane) throw new NotFoundException('Lane not found');
    return lane;
  }
}
