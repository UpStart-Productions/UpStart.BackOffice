import { Injectable } from '@nestjs/common';
import type { DimensionEntity } from '@upstart/back-office/shared';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../tenancy/tenant-context';
import {
  catalogGroupForDefinition,
  definitionRowToDto,
  distinctValuesForDefinition,
  ensureEntityDimensionDefinitions,
  addCatalogValue,
  hideCatalogValue,
  purgeCatalogValue,
  renameCatalogValue,
  restoreCatalogValue,
} from './dimensions.util';

@Injectable()
export class DimensionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions(entity: DimensionEntity) {
    const tenantId = currentTenantId();
    await ensureEntityDimensionDefinitions(this.prisma, tenantId, entity);
    const rows = await this.prisma.dimensionDefinition.findMany({
      where: { entity },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        entity: true,
        key: true,
        label: true,
        sortOrder: true,
        presets: true,
        catalogExcluded: true,
        searchInGlobal: true,
      },
    });
    return Promise.all(
      rows.map(async (row) => definitionRowToDto(row, await distinctValuesForDefinition(this.prisma, row.id))),
    );
  }

  async listCatalogManage(entity: DimensionEntity) {
    const tenantId = currentTenantId();
    await ensureEntityDimensionDefinitions(this.prisma, tenantId, entity);
    const rows = await this.prisma.dimensionDefinition.findMany({
      where: { entity },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, entity: true, key: true, label: true, presets: true, catalogExcluded: true },
    });
    return Promise.all(rows.map((row) => catalogGroupForDefinition(this.prisma, row)));
  }

  async addToSuggestions(entity: DimensionEntity, key: string, name: string) {
    await ensureEntityDimensionDefinitions(this.prisma, currentTenantId(), entity);
    await addCatalogValue(this.prisma, entity, key, name);
  }

  async hideFromSuggestions(entity: DimensionEntity, key: string, name: string) {
    await ensureEntityDimensionDefinitions(this.prisma, currentTenantId(), entity);
    await hideCatalogValue(this.prisma, entity, key, name);
  }

  async restoreToSuggestions(entity: DimensionEntity, key: string, name: string) {
    await restoreCatalogValue(this.prisma, entity, key, name);
  }

  async purgeEverywhere(entity: DimensionEntity, key: string, name: string) {
    await purgeCatalogValue(this.prisma, entity, key, name);
  }

  async renameEverywhere(entity: DimensionEntity, key: string, from: string, to: string) {
    await renameCatalogValue(this.prisma, entity, key, from, to);
  }
}
