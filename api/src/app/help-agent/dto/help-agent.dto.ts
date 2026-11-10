import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  HELP_AGENT_HISTORY_LIMIT,
  HELP_AGENT_HISTORY_TEXT_MAX,
  HELP_AGENT_TARGET_KINDS,
  type HelpAgentTargetKind,
} from '@upstart/back-office/shared';

const SUPPORTED_PROVIDERS = ['ANTHROPIC', 'OPENAI', 'GEMINI'] as const;

export class SaveHelpAgentSettingsDto {
  @IsIn(SUPPORTED_PROVIDERS)
  provider!: (typeof SUPPORTED_PROVIDERS)[number];

  @IsString()
  @MinLength(1)
  model!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  apiKey?: string;
}

/** Screen the person is on. Route pattern and title only (see HelpAgentPageContext). */
export class HelpAgentPageContextDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9:/_-]+$/, { message: 'route must be a route pattern' })
  route!: string;

  @IsString()
  @MaxLength(120)
  title!: string;
}

export class HelpAgentHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(HELP_AGENT_HISTORY_TEXT_MAX)
  text!: string;
}

/** What the person pointed at. Shape only here; the service drops labels not on the allowlist. */
export class HelpAgentTargetDto {
  @IsIn(HELP_AGENT_TARGET_KINDS)
  kind!: HelpAgentTargetKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  panel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,80}$/)
  helpKey?: string;

  @IsOptional()
  @IsBoolean()
  withheld?: boolean;
}

export class AskHelpAgentDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => HelpAgentPageContextDto)
  page?: HelpAgentPageContextDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(HELP_AGENT_HISTORY_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => HelpAgentHistoryMessageDto)
  history?: HelpAgentHistoryMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => HelpAgentTargetDto)
  target?: HelpAgentTargetDto;
}
