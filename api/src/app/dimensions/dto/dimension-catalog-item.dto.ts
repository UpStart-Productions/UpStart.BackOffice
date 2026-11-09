import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { CLIENT_DIMENSION_KEYS, DIMENSION_ENTITIES, DIMENSION_TAG_KEY, type DimensionEntity } from '@upstart/back-office/shared';

const CLIENT_KEYS = Object.values(CLIENT_DIMENSION_KEYS);
const CATALOG_KEYS = [...CLIENT_KEYS, DIMENSION_TAG_KEY];

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
