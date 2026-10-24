import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { CreateLaneDto, PipelineNameDto, ReorderLanesDto, UpdateLaneDto } from './dto/pipelines.dto';
import { PipelinesService } from './pipelines.service';

/** Pipelines and their lanes. Anyone with Pipeline access can edit lanes (role actions are a later change). */
@ApiTags('pipelines')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('pipeline')
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Get()
  list() {
    return this.pipelines.list();
  }

  @Action('setup')
  @Post()
  create(@Body() dto: PipelineNameDto) {
    return this.pipelines.createPipeline(dto.name);
  }

  @Action('setup')
  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: PipelineNameDto) {
    return this.pipelines.renamePipeline(id, dto.name);
  }

  @Action('setup')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pipelines.deletePipeline(id);
  }

  @Action('setup')
  @Post(':id/stages')
  addLane(@Param('id') id: string, @Body() dto: CreateLaneDto) {
    return this.pipelines.addLane(id, dto);
  }

  @Action('setup')
  @Put(':id/stages/order')
  reorder(@Param('id') id: string, @Body() dto: ReorderLanesDto) {
    return this.pipelines.reorderLanes(id, dto.stageIds);
  }
}

@ApiTags('pipelines')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('pipeline')
@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Action('setup')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLaneDto) {
    return this.pipelines.updateLane(id, dto);
  }

  @Action('setup')
  @Delete(':id')
  @ApiQuery({ name: 'moveTo', required: false, description: 'Lane to move this lane\'s cards to' })
  remove(@Param('id') id: string, @Query('moveTo') moveTo?: string) {
    return this.pipelines.deleteLane(id, moveTo);
  }
}
