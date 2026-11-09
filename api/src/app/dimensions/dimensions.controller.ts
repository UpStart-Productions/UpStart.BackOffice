import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DIMENSION_ENTITIES, type DimensionEntity } from '@upstart/back-office/shared';
import { AccessGuard, AdminOnly, Area } from '../access/access.guard';
import { DimensionCatalogActionDto, DimensionCatalogRenameDto } from './dto/dimension-catalog-item.dto';
import { DimensionsService } from './dimensions.service';

@ApiTags('dimensions')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('clients')
@Controller('dimensions')
export class DimensionsController {
  constructor(private readonly dimensions: DimensionsService) {}

  /** Platform dimension definitions for an entity type (e.g. organization tags, services). */
  @Get('definitions')
  listDefinitions(@Query('entity') entity?: string) {
    const e = (entity ?? 'CLIENT').toUpperCase() as DimensionEntity;
    if (!(DIMENSION_ENTITIES as readonly string[]).includes(e)) {
      return [];
    }
    return this.dimensions.listDefinitions(e);
  }

  /** Curated suggestion lists (Settings): usage counts and hidden state. */
  @Get('catalog/manage')
  @AdminOnly()
  listCatalogManage(@Query('entity') entity?: string) {
    const e = (entity ?? 'CLIENT').toUpperCase() as DimensionEntity;
    if (!(DIMENSION_ENTITIES as readonly string[]).includes(e)) {
      return [];
    }
    return this.dimensions.listCatalogManage(e);
  }

  @Post('catalog/add')
  @AdminOnly()
  addToSuggestions(@Body() dto: DimensionCatalogActionDto) {
    const entity = dto.entity ?? 'CLIENT';
    return this.dimensions.addToSuggestions(entity, dto.key, dto.name);
  }

  @Post('catalog/hide')
  @AdminOnly()
  hideFromSuggestions(@Body() dto: DimensionCatalogActionDto) {
    const entity = dto.entity ?? 'CLIENT';
    return this.dimensions.hideFromSuggestions(entity, dto.key, dto.name);
  }

  @Post('catalog/restore')
  @AdminOnly()
  restoreToSuggestions(@Body() dto: DimensionCatalogActionDto) {
    const entity = dto.entity ?? 'CLIENT';
    return this.dimensions.restoreToSuggestions(entity, dto.key, dto.name);
  }

  @Post('catalog/purge')
  @AdminOnly()
  purgeEverywhere(@Body() dto: DimensionCatalogActionDto) {
    const entity = dto.entity ?? 'CLIENT';
    return this.dimensions.purgeEverywhere(entity, dto.key, dto.name);
  }

  @Post('catalog/rename')
  @AdminOnly()
  renameEverywhere(@Body() dto: DimensionCatalogRenameDto) {
    const entity = dto.entity ?? 'CLIENT';
    return this.dimensions.renameEverywhere(entity, dto.key, dto.name, dto.toName);
  }
}
