import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { clientIp } from '../common/rate-limiter';
import { CarePublicService } from './care-public.service';
import { PasscodeDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './care.dto';

/**
 * Public Care links (/care-form/:token in the admin app). No sign-in: the token finds the link and its
 * tenant. Links with a passcode or emailed code need X-Care-Access from /passcode or /verify-code.
 */
@ApiTags('care-links')
@Controller('care-links')
export class CarePublicController {
  constructor(private readonly care: CarePublicService) {}

  @Get(':token')
  info(@Req() req: Request, @Param('token') token: string) {
    return this.care.info(token, clientIp(req));
  }

  @Post(':token/passcode')
  passcode(@Req() req: Request, @Param('token') token: string, @Body() dto: PasscodeDto) {
    return this.care.passcode(token, clientIp(req), dto);
  }

  @Post(':token/send-code')
  sendCode(@Req() req: Request, @Param('token') token: string, @Body() dto: SendCodeDto) {
    return this.care.sendCode(token, clientIp(req), dto);
  }

  @Post(':token/verify-code')
  verifyCode(@Req() req: Request, @Param('token') token: string, @Body() dto: VerifyCodeDto) {
    return this.care.verifyCode(token, clientIp(req), dto);
  }

  @Get(':token/form')
  @ApiHeader({ name: 'X-Care-Access', required: false })
  form(@Req() req: Request, @Param('token') token: string, @Headers('x-care-access') access?: string) {
    return this.care.form(token, clientIp(req), access);
  }

  @Post(':token/submit')
  @ApiHeader({ name: 'X-Care-Access', required: false })
  submit(@Req() req: Request, @Param('token') token: string, @Body() dto: PublicSubmitDto, @Headers('x-care-access') access?: string) {
    return this.care.submit(token, clientIp(req), access, dto);
  }
}
