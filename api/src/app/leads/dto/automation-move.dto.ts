import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

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
}
