import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListMentionCandidatesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  /** `activity` = org activity log: invoices + projects on open; tasks only when `q` has 2+ chars. */
  @IsOptional()
  @IsString()
  context?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(String(value), 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
