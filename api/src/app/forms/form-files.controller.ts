import { Controller, NotFoundException, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { allows, FORM_FILE_MAX_BYTES, isAdminRole, normalizeFormSettings } from '@upstart/back-office/shared';
import { AccessGuard, SignedIn } from '../access/access.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeFormAccess } from './form-access.util';
import { FormFilesService, formFilesPrefix, type UploadedFormFile } from './form-files.service';
import { M } from './free-forms.util';

/**
 * Staff file uploads for a form's FILE fields (client form results, submissions, visit checklists). Who may
 * upload: anyone who can edit the form in Forms, edit its answers on client pages, or log visits (visit checklist).
 * Downloads are on each answer's own API (client-forms, form-admin, care visits), which check access to that answer.
 */
@ApiTags('form-files')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@SignedIn()
@Controller('form-files')
export class FormFilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FormFilesService,
  ) {}

  @Post('forms/:formId')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FORM_FILE_MAX_BYTES } }))
  async upload(@Req() req: Request, @Param('formId') formId: string, @UploadedFile() file: UploadedFormFile | undefined) {
    const user = req.user as UserContext;
    const form = await this.prisma.form.findFirst({ where: { id: formId, module: M }, select: { id: true, access: true, settings: true } });
    if (!form || !(await this.canUpload(user, form))) throw new NotFoundException('Form not found');
    return this.files.store(formFilesPrefix(form.id), file);
  }

  private async canUpload(user: UserContext, form: { access: unknown; settings: unknown }): Promise<boolean> {
    if (isAdminRole(user.role)) return true;
    if (allows(user, 'forms', 'edit')) return true;
    if (normalizeFormSettings(form.settings).visitChecklist && (allows(user, 'visits', 'create') || allows(user, 'visits', 'edit'))) return true;
    const row = await this.prisma.user.findUnique({ where: { id: user.id }, select: { roleId: true } });
    return !!row?.roleId && sanitizeFormAccess(form.access)[row.roleId] === 'edit';
  }
}
