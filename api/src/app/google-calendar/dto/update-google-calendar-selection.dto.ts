import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateGoogleCalendarSelectionDto {
  @ApiProperty() @IsString() @MinLength(1) calendarId!: string;
}
