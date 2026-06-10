import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAsanaConfigDto {
  @ApiProperty() @IsString() @MinLength(1) clientId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientSecret?: string;
  @ApiProperty() @IsString() @MinLength(1) redirectUri!: string;
}
