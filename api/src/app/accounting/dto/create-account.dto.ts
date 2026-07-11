import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type AccountTypeDto = (typeof ACCOUNT_TYPES)[number];

export class CreateAccountDto {
  @ApiProperty({ example: '1000' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'Code can only contain letters, numbers, and hyphens' })
  @MaxLength(20)
  code!: string;

  @ApiProperty({ example: 'Business Checking' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ACCOUNT_TYPES })
  @IsEnum(ACCOUNT_TYPES)
  type!: AccountTypeDto;
}
