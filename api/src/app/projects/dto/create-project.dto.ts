import { IsString, IsOptional, IsBoolean, IsNumber, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @ApiProperty() @IsString() clientId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactFirstName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactLastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactPhone?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() contactEmail?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) hourlyRate?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}
