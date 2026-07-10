import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateNetworkContactDto {
  @ApiProperty() @IsString() firstName!: string;
  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() lastName?: string;
  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;
  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() linkedInUrl?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPrimary?: boolean;
  @ApiPropertyOptional() @IsDateString() @IsOptional() lastContactDate?: string;
}

export class CreateNetworkContactBodyDto extends CreateNetworkContactDto {
  @ApiProperty() @IsString() companyId!: string;
}
