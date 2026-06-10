import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArtifactType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateArtifactDto {
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;

  @ApiProperty({ enum: ArtifactType }) @IsEnum(ArtifactType) type!: ArtifactType;
  @ApiProperty() @IsString() title!: string;

  // FILE
  @ApiPropertyOptional() @IsString() @IsOptional() fileUrl?: string;
  @ApiPropertyOptional() @IsInt() @IsOptional() fileSize?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() mimeType?: string;

  // LINK
  @ApiPropertyOptional() @IsString() @IsOptional() url?: string;

  // NOTE
  @ApiPropertyOptional() @IsString() @IsOptional() content?: string;
}
