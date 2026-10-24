import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SUPPORT_FEEDBACK_TOPIC_IDS, type SupportFeedbackTopicId } from '@upstart/back-office/shared';

export class SupportClientEnvironmentDto {
  @IsString()
  @MaxLength(4000)
  href!: string;

  @IsString()
  @MaxLength(64)
  language!: string;

  @IsArray()
  @IsString({ each: true })
  languages!: string[];

  @IsString()
  @MaxLength(128)
  timezone!: string;

  @IsNumber()
  screenWidth!: number;

  @IsNumber()
  screenHeight!: number;

  @IsNumber()
  viewportWidth!: number;

  @IsNumber()
  viewportHeight!: number;

  @IsString()
  @MaxLength(256)
  platform!: string;

  @IsOptional()
  @IsBoolean()
  cookieEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  devicePixelRatio?: number;
}

export class SubmitSupportFeedbackDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...SUPPORT_FEEDBACK_TOPIC_IDS], { each: true })
  topicIds!: SupportFeedbackTopicId[];

  @IsString()
  @MinLength(1)
  @MaxLength(16000)
  message!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SupportClientEnvironmentDto)
  clientEnvironment!: SupportClientEnvironmentDto;
}
