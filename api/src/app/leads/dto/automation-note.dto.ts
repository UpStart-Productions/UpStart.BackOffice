import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Payload for POST /leads/automation/:id/research-note
 * Used by the weekly pipeline-outreach automation to attach research
 * notes to a lead and mark it as picked.
 */
export class AutomationNoteDto {
  /** Plain-text / markdown research note. Stored as a Quill-compatible NOTE artifact. */
  @ApiProperty() @IsString() content!: string;

  /** Optional artifact title. Defaults to "Research Note - <date>". */
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;

  /**
   * ISO date string to stamp as the lead's lastContactDate (marks it as
   * "picked" so future runs can deprioritize it). Defaults to now.
   */
  @ApiPropertyOptional() @IsString() @IsOptional() pickedDate?: string;
}
