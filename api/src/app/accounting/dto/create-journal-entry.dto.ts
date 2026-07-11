import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class JournalLineDto {
  @ApiProperty() @IsString() accountId!: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) @Type(() => Number) debit?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Min(0) @Type(() => Number) credit?: number;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-07-11' }) @IsDateString() date!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() memo?: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}
