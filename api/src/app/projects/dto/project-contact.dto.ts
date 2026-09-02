import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class ProjectContactInputDto {
  @ApiPropertyOptional() @IsString() @IsOptional() id?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() firstName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() lastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional() @IsInt() @IsOptional() sortOrder?: number;
}

export class SyncProjectContactsDto {
  @ApiProperty({ type: [ProjectContactInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectContactInputDto)
  contacts!: ProjectContactInputDto[];
}
