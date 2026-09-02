import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendInvoiceDto {
  @ApiProperty({ example: 'billing@example.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  toName?: string;

  @ApiPropertyOptional({ example: 'Thanks again for the rush turnaround.' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  message?: string;
}
