import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProjectTaskInputDto {
  @ApiPropertyOptional() @IsString() @IsOptional() id?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsInt() @Min(0) @IsOptional() sortOrder?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class SyncProjectTasksDto {
  @ApiProperty({ type: [ProjectTaskInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectTaskInputDto)
  tasks!: ProjectTaskInputDto[];
}
