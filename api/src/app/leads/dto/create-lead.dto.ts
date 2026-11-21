import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { LEGACY_SOURCE_ENUM_TO_LABEL } from '@upstart/back-office/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateLeadDto {
  @ApiProperty() @IsString() organization!: string;

  @ApiPropertyOptional() @IsString() @IsOptional() primaryContact?: string;
  /** The card's contact when no person is linked. Empty clears it. */
  @ApiPropertyOptional() @IsString() @IsOptional() contactFirstName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactLastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactRole?: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() warmConnection?: string;

  @ApiPropertyOptional({ description: 'Primary contact person (People panel)' })
  @IsString()
  @IsOptional()
  primaryContactId?: string;

  @ApiPropertyOptional({ description: 'Warm introduction contact (People panel)' })
  @IsString()
  @IsOptional()
  warmConnectionContactId?: string | null;

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

  /** A Contact sources pick list value (old codes like INBOUND are read as their label). */
  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === 'string' ? LEGACY_SOURCE_ENUM_TO_LABEL[value] ?? value.trim() : value))
  @IsString()
  @IsOptional()
  source?: string;

  @ApiPropertyOptional({ description: 'Preset code or custom category label' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceInterests?: string[];

  @ApiPropertyOptional() @IsDateString() @IsOptional() nextActionDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() lastContactDate?: string;

  @ApiPropertyOptional({ description: 'What the opportunity is worth if won' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  estimatedValue?: number | null;

  @ApiPropertyOptional({ description: 'When the deal is expected to close' })
  @IsDateString()
  @IsOptional()
  expectedCloseDate?: string | null;

  @ApiPropertyOptional({ description: 'Link this card to an existing account' })
  @IsString()
  @IsOptional()
  clientId?: string | null;
}
