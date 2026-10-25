import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PasswordResetService } from './password-reset.service';

export class RequestPasswordResetDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class ConfirmPasswordResetDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(4) @MaxLength(12) code!: string;
  @IsString() @MinLength(8) @MaxLength(256) password!: string;
}

/** Public (unauthenticated) password reset. The emailed code is the credential. */
@ApiTags('password-reset')
@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post('request')
  @HttpCode(200)
  async request(@Body() dto: RequestPasswordResetDto) {
    await this.resets.request(dto.email);
    return { ok: true };
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(@Body() dto: ConfirmPasswordResetDto) {
    await this.resets.confirm(dto.email, dto.code, dto.password);
    return { ok: true };
  }
}
