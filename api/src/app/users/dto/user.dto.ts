import { Allow, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

const USER_ROLES = ['ADMIN', 'MEMBER'] as const;

const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export class UploadAvatarDto {
  @IsNotEmpty()
  @IsString()
  fileBase64!: string;

  @IsNotEmpty()
  @IsIn(AVATAR_MIMES)
  mimeType!: (typeof AVATAR_MIMES)[number];
}

export class CreateUserDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsNotEmpty()
  @IsIn(USER_ROLES)
  role!: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsNumber()
  hourlyRate?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: (typeof USER_ROLES)[number];

  @IsOptional()
  @IsNumber()
  hourlyRate?: number | null;

  /** Set to null to remove avatar; omit to leave unchanged. */
  @IsOptional()
  @Allow()
  avatarUrl?: string | null;
}

export class SetUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
