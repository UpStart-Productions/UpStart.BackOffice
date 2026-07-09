import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, Min } from 'class-validator';

export class MarkInvoicePaidDto {
  @ApiProperty({ example: 1500 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amountPaid!: number;

  @ApiProperty({ example: '2026-07-08' })
  @IsDateString()
  paidAt!: string;
}
