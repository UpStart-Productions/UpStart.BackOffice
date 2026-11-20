import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { CreateCapturePointDto, UpdateCapturePointDto } from './capture-points.dto';
import { CapturePointsService } from './capture-points.service';

/** Capture points: what feeds each pipeline. Anyone with Pipeline access sees them; setup changes them. */
@ApiTags('pipelines')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('pipeline')
@Controller('capture-points')
export class CapturePointsController {
  constructor(private readonly capturePoints: CapturePointsService) {}

  @Get()
  @ApiQuery({ name: 'pipelineId', required: false })
  @ApiQuery({ name: 'formId', required: false })
  list(@Query('pipelineId') pipelineId?: string, @Query('formId') formId?: string) {
    return this.capturePoints.list({ pipelineId, formId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.capturePoints.get(id);
  }

  @Action('setup')
  @Post()
  create(@Body() dto: CreateCapturePointDto) {
    return this.capturePoints.create(dto);
  }

  @Action('setup')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCapturePointDto) {
    return this.capturePoints.update(id, dto);
  }

  @Action('setup')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.capturePoints.remove(id);
  }
}
