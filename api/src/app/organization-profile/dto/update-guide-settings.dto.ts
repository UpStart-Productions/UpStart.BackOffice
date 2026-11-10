import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateGuideSettingsDto {
  /** Let the Back Office guide look up this tenant's records (sends them to the AI provider). */
  @ApiProperty() @IsBoolean() readsRecords!: boolean;
}
