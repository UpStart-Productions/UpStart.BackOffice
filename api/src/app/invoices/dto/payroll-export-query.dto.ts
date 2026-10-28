import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Issue-date range (inclusive) for the export of invoices billed to the organization. */
export class PayrollExportQueryDto {
  @ApiProperty({ example: '2026-10-01' }) @Matches(YMD, { message: 'from must be YYYY-MM-DD' }) from!: string;
  @ApiProperty({ example: '2026-10-31' }) @Matches(YMD, { message: 'to must be YYYY-MM-DD' }) to!: string;
}
