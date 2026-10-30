import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { clientIp } from '../common/rate-limiter';
import { FormPublicService } from './form-public.service';
import { PasscodeDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './form.dto';

/**
 * Public form links. No sign-in: the token finds the link and its tenant. Links with a passcode or emailed
 * code need X-Form-Access from /passcode or /verify-code. /care-links and X-Care-Access are kept for pages
 * opened before the form engine.
 */
@ApiTags('form-links')
@Controller(['form-links', 'care-links'])
export class FormPublicController {
  constructor(private readonly forms: FormPublicService) {}

  @Get(':token')
  info(@Req() req: Request, @Param('token') token: string) {
    return this.forms.info(token, clientIp(req));
  }

  @Post(':token/passcode')
  passcode(@Req() req: Request, @Param('token') token: string, @Body() dto: PasscodeDto) {
    return this.forms.passcode(token, clientIp(req), dto);
  }

  @Post(':token/send-code')
  sendCode(@Req() req: Request, @Param('token') token: string, @Body() dto: SendCodeDto) {
    return this.forms.sendCode(token, clientIp(req), dto);
  }

  @Post(':token/verify-code')
  verifyCode(@Req() req: Request, @Param('token') token: string, @Body() dto: VerifyCodeDto) {
    return this.forms.verifyCode(token, clientIp(req), dto);
  }

  @Get(':token/form')
  @ApiHeader({ name: 'X-Form-Access', required: false })
  form(
    @Req() req: Request,
    @Param('token') token: string,
    @Headers('x-form-access') access?: string,
    @Headers('x-care-access') legacy?: string,
  ) {
    return this.forms.form(token, clientIp(req), access ?? legacy);
  }

  @Post(':token/submit')
  @ApiHeader({ name: 'X-Form-Access', required: false })
  submit(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() dto: PublicSubmitDto,
    @Headers('x-form-access') access?: string,
    @Headers('x-care-access') legacy?: string,
  ) {
    return this.forms.submit(token, clientIp(req), access ?? legacy, dto);
  }
}

/** A respondent's results page data (scored forms). No sign-in: the long random token is the key. */
@ApiTags('form-links')
@Controller('form-results')
export class FormResultsController {
  constructor(private readonly forms: FormPublicService) {}

  @Get(':token')
  result(@Req() req: Request, @Param('token') token: string) {
    return this.forms.result(token, clientIp(req));
  }
}
