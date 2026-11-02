import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { FORM_FILE_MAX_BYTES } from '@upstart/back-office/shared';
import type { UploadedFormFile } from './form-files.service';
import { FORM_EMBED_SCRIPT } from './form-embed.script';
import { clientIp } from '../common/rate-limiter';
import { FormPublicService, type PublicRequest } from './form-public.service';
import { PasscodeDto, PublicDraftDto, PublicSubmitDto, SendCodeDto, VerifyCodeDto } from './form.dto';

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
    @Query('draft') draft?: string,
  ) {
    return this.forms.form(pub(req), token, access ?? legacy, draft);
  }

  /** Auto-save: the answers changed since the last save. New-response links get a draft token on the first save. */
  @Post(':token/draft')
  @ApiHeader({ name: 'X-Form-Access', required: false })
  draft(@Req() req: Request, @Param('token') token: string, @Body() dto: PublicDraftDto, @Headers('x-form-access') access?: string) {
    return this.forms.saveDraft(pub(req), token, access, dto);
  }

  /** One file for a file question (multipart "file"). Returns the reference to send with the answers. */
  @Post(':token/files')
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: 'X-Form-Access', required: false })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FORM_FILE_MAX_BYTES } }))
  uploadFile(
    @Req() req: Request,
    @Param('token') token: string,
    @UploadedFile() file: UploadedFormFile | undefined,
    @Headers('x-form-access') access?: string,
  ) {
    return this.forms.uploadFile(pub(req), token, access, file);
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
