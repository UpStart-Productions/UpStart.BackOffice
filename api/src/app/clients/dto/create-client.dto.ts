import { IsString, IsEmail, IsOptional, IsBoolean, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateClientDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Short code prepended to invoice numbers, e.g. UPSP' })
  @IsString() @Length(1, 8) code!: string;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() zip?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}
