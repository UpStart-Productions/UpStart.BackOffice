import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** CSV file contents, base64-encoded — same convention as bank import. */
export class ImportTimesheetDto {
  @ApiProperty() @IsString() fileBase64!: string;
}
