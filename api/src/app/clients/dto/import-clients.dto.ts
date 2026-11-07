import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** CSV / Excel file contents, base64-encoded. */
export class ImportClientsFileDto {
  @ApiProperty() @IsString() fileBase64!: string;
}
