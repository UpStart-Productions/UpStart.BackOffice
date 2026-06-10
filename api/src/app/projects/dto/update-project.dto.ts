import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional() @IsString() @IsOptional() asanaProjectGid?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() asanaProjectName?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() asanaSectionGid?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() asanaSectionName?: string | null;
}

export class AsanaTaskBillableDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsBoolean() isBillable!: boolean;
}

export class UpdateAsanaTaskBillablesDto {
  @ApiProperty({ type: [AsanaTaskBillableDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AsanaTaskBillableDto)
  tasks!: AsanaTaskBillableDto[];
}
