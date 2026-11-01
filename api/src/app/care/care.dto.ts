import { IsIn, IsOptional } from 'class-validator';

export class SetCareStatusDto {
  /** null takes the client out of care (their visits and shifts stay). */
  @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'ENDED']) status!: 'ACTIVE' | 'PAUSED' | 'ENDED' | null;
}
