import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePortalSessionDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
