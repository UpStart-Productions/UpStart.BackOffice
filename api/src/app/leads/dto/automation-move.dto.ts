import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Payload for PATCH /leads/automation/:id/stage
 * Moves a card to another lane of its own pipeline, by lane name
 * (e.g. a checkout webhook moving an order to "New Order" or "Abandoned").
 */
export class AutomationMoveDto {
  /** Lane name in the card's pipeline. Matched case-insensitively. */
  @ApiProperty() @IsString() stageName!: string;

  /** Optional plain-text note to attach to the card with the move. */
  @ApiPropertyOptional() @IsString() @IsOptional() note?: string;

  /** Optional title for that note. Defaults to "Moved to <lane>". */
  @ApiPropertyOptional() @IsString() @IsOptional() noteTitle?: string;

  /** Where the note goes: "artifact" (Notes, the default) or "activity" (the card's Activity timeline). */
  @ApiPropertyOptional({ enum: ['artifact', 'activity'] })
  @IsIn(['artifact', 'activity'])
  @IsOptional()
  noteAs?: 'artifact' | 'activity';

  /** Optional new Next action text for the card (e.g. "Build map and send proof"). */
  @ApiPropertyOptional() @IsString() @IsOptional() nextAction?: string;

  /** Optional ISO date for that next action. Defaults to today when nextAction is given. */
  @ApiPropertyOptional() @IsString() @IsOptional() nextActionDate?: string;
}
