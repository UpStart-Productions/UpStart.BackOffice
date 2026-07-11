import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CategorizeBankTransactionDto {
  @ApiProperty() @IsString() accountId!: string;
}
