import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { InvitesService } from './invites.service';

export class AcceptInviteDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(256) password?: string;
}

/** Public (unauthenticated) endpoints behind the emailed invite link. The token is the credential. */
@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Get(':token')
  lookup(@Param('token') token: string) {
    return this.invites.lookup(token);
  }

  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.invites.accept(token, dto);
  }
}
