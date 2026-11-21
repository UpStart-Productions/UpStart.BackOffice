import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CLIENT_DIMENSION_KEYS, DIMENSION_ENTITIES, DIMENSION_TAG_KEY, LEAD_DIMENSION_KEYS, type DimensionEntity } from '@upstart/back-office/shared';

const CLIENT_KEYS = Object.values(CLIENT_DIMENSION_KEYS);
// Every pick list key: account lists, tags, and pipeline lists (contact sources). Duplicates are harmless.
const CATALOG_KEYS = [...new Set([...CLIENT_KEYS, DIMENSION_TAG_KEY, ...Object.values(LEAD_DIMENSION_KEYS)])];

export class DimensionCatalogActionDto {
  @IsOptional()
  @IsString()
  @IsIn(DIMENSION_ENTITIES)
  entity?: DimensionEntity;

  @IsString()
  @IsIn(CATALOG_KEYS)
  key!: (typeof CATALOG_KEYS)[number];

  @IsString()
  @MinLength(1)
  name!: string;
}

export class DimensionCatalogRenameDto extends DimensionCatalogActionDto {
  @IsString()
  @MinLength(1)
  toName!: string;
}
