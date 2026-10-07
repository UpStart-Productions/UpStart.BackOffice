import { Body, Controller, Get, Headers, Param, Post, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { SubmitFormDto } from './dto/task-manager.dto';
import { FORM_MAX_FILE_BYTES, FORM_MAX_FILES, TaskFormsService } from './task-forms.service';

type Uploaded = { buffer: Buffer; mimetype: string; originalname: string; size: number };

/** `X-Form-Key: ubof_…` or `Authorization: Bearer ubof_…` */
function formKey(headers: Record<string, string | string[] | undefined>): string | null {
  const direct = headers['x-form-key'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const auth = headers['authorization'];
  if (typeof auth === 'string' && /^Bearer\s+ubof_/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return null;
}

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}

/**
 * Public form endpoints (no UBO session):
 * - OPEN forms: anyone; submitter email required; rate-limited per IP.
 * - API_KEY forms: requests carry the form's key (server-to-server, e.g. GrovLink).
 * Collaborator-only forms use the signed-in /tm/f/:slug routes instead.
 */
@ApiTags('forms')
@Controller('forms')
export class FormsPublicController {
  constructor(private readonly forms: TaskFormsService) {}

  @Get(':slug')
  @ApiHeader({ name: 'X-Form-Key', required: false, description: 'Required for API-key forms' })
  definition(@Param('slug') slug: string, @Headers() headers: Record<string, string>) {
    return this.forms.publicDefinition(slug, formKey(headers));
  }

  @Post(':slug/submit')
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiHeader({ name: 'X-Form-Key', required: false, description: 'Required for API-key forms' })
  @UseInterceptors(FilesInterceptor('files', FORM_MAX_FILES, { storage: memoryStorage(), limits: { fileSize: FORM_MAX_FILE_BYTES } }))
  submit(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @UploadedFiles() files: Uploaded[] | undefined,
  ) {
    return this.forms.submitPublic(slug, dto, files ?? [], { ip: clientIp(req), apiKey: formKey(req.headers) });
  }
}
