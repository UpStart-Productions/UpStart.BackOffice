import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHelpAgentThreadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  /** Chat messages as the panel keeps them; validated and trimmed by the service. */
  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() messages?: unknown[];
  /** Ties the conversation to a record, e.g. recordType "account". */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) recordType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) recordId?: string;
}

export class UpdateHelpAgentThreadDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional({ type: [Object] }) @IsOptional() @IsArray() messages?: unknown[];
}
