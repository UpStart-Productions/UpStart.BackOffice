import { Body, Controller, Get, Headers, Param, Post, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { FORM_EMBED_SCRIPT } from './form-embed.script';
import { clientIp } from '../common/rate-limiter';
import { FormPublicService, type PublicRequest } from './form-public.service';
import { PasscodeDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './form.dto';

function pub(req: Request): PublicRequest {
  const origin = req.headers.origin;
  return { ip: clientIp(req), origin: typeof origin === 'string' ? origin : undefined };
}

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
    return this.forms.info(pub(req), token);
  }

  @Post(':token/passcode')
  passcode(@Req() req: Request, @Param('token') token: string, @Body() dto: PasscodeDto) {
    return this.forms.passcode(pub(req), token, dto);
  }

  @Post(':token/send-code')
  sendCode(@Req() req: Request, @Param('token') token: string, @Body() dto: SendCodeDto) {
    return this.forms.sendCode(pub(req), token, dto);
  }

  @Post(':token/verify-code')
  verifyCode(@Req() req: Request, @Param('token') token: string, @Body() dto: VerifyCodeDto) {
    return this.forms.verifyCode(pub(req), token, dto);
  }

  @Get(':token/form')
  @ApiHeader({ name: 'X-Form-Access', required: false })
  form(
    @Req() req: Request,
    @Param('token') token: string,
    @Headers('x-form-access') access?: string,
    @Headers('x-care-access') legacy?: string,
  ) {
    return this.forms.form(pub(req), token, access ?? legacy);
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
    return this.forms.submit(pub(req), token, access ?? legacy, dto);
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

/** The embed script: <script src=".../api/form-embed.js" data-ubo-form="LINK_TOKEN" async></script> draws the form on any website. */
@ApiTags('form-links')
@Controller()
export class FormEmbedController {
  @Get('form-embed.js')
  script(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(FORM_EMBED_SCRIPT);
  }
}
