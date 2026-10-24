import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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

export class AskHelpAgentDto {
  @IsString()
  @MinLength(1)
  message!: string;
}
