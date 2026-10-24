import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PipelineNameDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
}

export class CreateLaneDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(40) color?: string;
}

export class UpdateLaneDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) @IsOptional() name?: string;
  @ApiPropertyOptional({ nullable: true }) @IsString() @IsOptional() @MaxLength(40) color?: string | null;
}

export class ReorderLanesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @IsString({ each: true }) stageIds!: string[];
}
