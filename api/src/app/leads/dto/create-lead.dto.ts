import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage, LeadSource, OrgCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateLeadDto {
  @ApiProperty() @IsString() organization!: string;

  @ApiPropertyOptional() @IsString() @IsOptional() primaryContact?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactRole?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() warmConnection?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nextAction?: string;

  /** Legacy fixed stage. Prefer stageId; this maps to the lane that came from it. */
  @ApiPropertyOptional({ enum: LeadStage })
  @IsEnum(LeadStage)
  @IsOptional()
  stage?: LeadStage;

  @ApiPropertyOptional({ description: 'Lane to put the card in' })
  @IsString()
  @IsOptional()
  stageId?: string;

  @ApiPropertyOptional({ description: 'Pipeline for a new card when no lane is given (its first lane is used)' })
  @IsString()
  @IsOptional()
  pipelineId?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: OrgCategory })
  @IsEnum(OrgCategory)
  @IsOptional()
  category?: OrgCategory;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceInterests?: string[];

  @ApiPropertyOptional() @IsDateString() @IsOptional() nextActionDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() lastContactDate?: string;
}
