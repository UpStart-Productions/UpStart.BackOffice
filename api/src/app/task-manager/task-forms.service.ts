import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, TaskCommentKind, TaskForm, TaskFormAccess } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { extname } from 'path';
import { UserContext } from '../common/app.types';
import { escapeHtml as escapeEmailHtml, wrapClientEmail } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { projectRootPrefix } from '../storage/storage-keys.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateFormDto, SubmitFormDto, UpdateFormDto } from './dto/task-manager.dto';
import { TaskAccessService } from './task-access.service';
import { TaskEventsService } from './task-events.service';
import { FieldOption } from './task-fields.util';
import {
  buildSubmission,
  defaultQuestions,
  FormQuestion,
  isValidEmail,
  normalizeQuestions,
  publicQuestions,
  withLiveFields,
  slugify,
} from './task-forms.util';
import { personName } from './task-people.util';
import { TasksService } from './tasks.service';

export const FORM_MAX_FILES = 5;
export const FORM_MAX_FILE_BYTES = 10 * 1024 * 1024;
const KEY_PREFIX = 'ubof_';

type Uploaded = { buffer: Buffer; mimetype: string; originalname: string; size: number };

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Small in-memory sliding-window limiter (single API container). */
class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return true;
  }
}

/**
 * Intake forms that create tasks in a project.
 * Access: OPEN (anyone, email required) · COLLABORATORS (signed-in people on the project) · API_KEY.
 */
@Injectable()
export class TaskFormsService {
  private readonly logger = new Logger(TaskFormsService.name);
  private readonly openLimiter = new RateLimiter(10, 10 * 60 * 1000);
  private readonly keyLimiter = new RateLimiter(300, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly tasks: TasksService,
    private readonly events: TaskEventsService,
    private readonly mail: MailService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ── Management (builder) ──────────────────────────────────────────────────

  async list(user: UserContext, projectId: string) {
    await this.access.assertProject(user, projectId, 'view');
    const forms = await this.prisma.taskForm.findMany({
      where: { projectId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const fields = await this.fieldsFor(projectId);
    return forms.map((f) => this.toDto(f, f._count.tasks, fields));
  }

  async get(user: UserContext, formId: string) {
    const form = await this.findOr404(formId);
    await this.access.assertProject(user, form.projectId, 'view');
    const count = await this.prisma.task.count({ where: { formId } });
    return this.toDto(form, count, await this.fieldsFor(form.projectId));
  }

  async create(user: UserContext, projectId: string, dto: CreateFormDto) {
    await this.access.assertProject(user, projectId, 'edit');
    const fields = await this.fieldsFor(projectId);
    const questions = dto.questions ? this.normalize(dto.questions, fields) : defaultQuestions();
    const slug = await this.uniqueSlug(dto.slug || dto.name);
    const form = await this.prisma.taskForm.create({
      data: {
        projectId,
        name: dto.name.trim(),
        slug,
        description: dto.description ?? null,
        access: dto.access ?? TaskFormAccess.COLLABORATORS,
        questions: questions as unknown as Prisma.InputJsonValue,
        createdById: user.id,
        ...(await this.settings(projectId, dto)),
      },
    });
    return this.toDto(form, 0);
  }

  async update(user: UserContext, formId: string, dto: UpdateFormDto) {
    const form = await this.findOr404(formId);
    await this.access.assertProject(user, form.projectId, 'edit');
    const data: Prisma.TaskFormUncheckedUpdateInput = { ...(await this.settings(form.projectId, dto)) };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.access !== undefined) data.access = dto.access;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.slug !== undefined && slugify(dto.slug) !== form.slug) data.slug = await this.uniqueSlug(dto.slug);
    if (dto.questions !== undefined) {
      data.questions = this.normalize(dto.questions, await this.fieldsFor(form.projectId)) as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.taskForm.update({ where: { id: formId }, data });
    return this.toDto(updated, await this.prisma.task.count({ where: { formId } }));
  }

  async remove(user: UserContext, formId: string) {
    const form = await this.findOr404(formId);
    await this.access.assertProject(user, form.projectId, 'edit');
    await this.prisma.taskForm.delete({ where: { id: formId } });
    return { deleted: true };
  }

  /** New API key for the form (shown once). Replaces any previous key. */
  async rotateKey(user: UserContext, formId: string) {
    const form = await this.findOr404(formId);
    await this.access.assertProject(user, form.projectId, 'edit');
    const random = randomBytes(32).toString('base64url');
    const key = `${KEY_PREFIX}${random}`;
    await this.prisma.taskForm.update({
      where: { id: formId },
      data: { apiKeyHash: hashKey(key), apiKeyHint: `${KEY_PREFIX}…${random.slice(-4)}` },
    });
    return { key, hint: `${KEY_PREFIX}…${random.slice(-4)}` };
  }

  // ── Filling in ────────────────────────────────────────────────────────────

  /** Public definition for /f/:slug (OPEN), or with the API key (API_KEY). Collaborator forms only say "sign in". */
  async publicDefinition(slug: string, apiKey?: string | null) {
    const form = await this.bySlug(slug);
    if (form.access === TaskFormAccess.COLLABORATORS) {
      return { slug: form.slug, name: form.name, access: form.access, requiresSignIn: true };
    }
    if (form.access === TaskFormAccess.API_KEY) this.assertKey(form, apiKey);
    return this.definition(form, await this.fieldsFor(form.projectId));
  }

  /** Definition for a signed-in collaborator. */
  async collaboratorDefinition(user: UserContext, slug: string) {
    const form = await this.bySlug(slug);
    await this.assertCollaborator(user, form);
    return this.definition(form, await this.fieldsFor(form.projectId));
  }

  /** OPEN or API_KEY submission (no signed-in user). */
  async submitPublic(slug: string, dto: SubmitFormDto, files: Uploaded[], meta: { ip: string; apiKey?: string | null }) {
    const form = await this.bySlug(slug);
    if (form.access === TaskFormAccess.COLLABORATORS) {
      throw new UnauthorizedException('Sign in to submit this form');
    }
    if (form.access === TaskFormAccess.API_KEY) {
      this.assertKey(form, meta.apiKey);
      if (!this.keyLimiter.allow(form.id)) throw new HttpException('Too many submissions — try again later', HttpStatus.TOO_MANY_REQUESTS);
    } else if (!this.openLimiter.allow(`${form.id}:${meta.ip}`)) {
      throw new HttpException('Too many submissions — try again in a few minutes', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Honeypot: bots fill the invisible "website" field. Pretend it worked.
    if (typeof dto.website === 'string' && dto.website.trim()) {
      return { ok: true, message: form.confirmationMessage || 'Thanks! Your submission was received.' };
    }
    const submitter = this.parseObject(dto.submitter) as { email?: unknown; name?: unknown } | null;
    const email = typeof submitter?.email === 'string' ? submitter.email.trim().toLowerCase() : '';
    const name = typeof submitter?.name === 'string' ? submitter.name.trim().slice(0, 200) : '';
    if (form.access === TaskFormAccess.OPEN && !isValidEmail(email)) throw new BadRequestException('Your email address is required');
    if (email && !isValidEmail(email)) throw new BadRequestException('Submitter email is not a valid address');
    return this.submit(form, dto, files, { user: null, email: email || null, name: name || null });
  }

  async submitAsCollaborator(user: UserContext, slug: string, dto: SubmitFormDto, files: Uploaded[]) {
    const form = await this.bySlug(slug);
    await this.assertCollaborator(user, form);
    return this.submit(form, dto, files, { user, email: user.email, name: personName(user) });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async submit(
    form: TaskForm,
    dto: SubmitFormDto,
    files: Uploaded[],
    who: { user: UserContext | null; email: string | null; name: string | null },
  ) {
    if (files.length > FORM_MAX_FILES) throw new BadRequestException(`Attach at most ${FORM_MAX_FILES} files`);
    if (files.some((f) => f.size > FORM_MAX_FILE_BYTES)) throw new BadRequestException('Each file must be 10 MB or smaller');
    const fields = await this.fieldsFor(form.projectId);
    const questions = withLiveFields((form.questions as unknown as FormQuestion[]) ?? [], fields);
    const answers = (this.parseObject(dto.answers) ?? {}) as Record<string, unknown>;
    const context = this.parseObject(dto.context);
    let built;
    try {
      built = buildSubmission(questions, answers, fields, {
        fileCount: files.length,
        formName: form.name,
        submitter: who.user ? null : { name: who.name, email: who.email },
        context: context as Record<string, unknown> | null,
      });
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid submission');
    }

    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: form.projectId }, select: { name: true, clientId: true } });
    const sectionId =
      form.sectionId ??
      (await this.prisma.taskSection.findFirst({ where: { projectId: form.projectId }, orderBy: { sortOrder: 'asc' }, select: { id: true } }))?.id ??
      null;
    const sortOrder = await this.tasks.placeInSection(form.projectId, sectionId, undefined);
    const tagIds = Array.isArray(form.tagIds) ? (form.tagIds as string[]) : [];
    const validTags = tagIds.length ? await this.prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } }) : [];

    const task = await this.prisma.task.create({
      data: {
        projectId: form.projectId,
        sectionId,
        name: built.name,
        description: built.descriptionHtml,
        assigneeId: form.assigneeId,
        createdById: who.user?.id ?? null,
        formId: form.id,
        submitterEmail: who.email,
        submitterName: who.name,
        sortOrder,
        fieldValues: { create: built.fieldValues.map((v) => ({ fieldId: v.fieldId, value: v.value as Prisma.InputJsonValue })) },
        tags: { create: validTags.map((t) => ({ tagId: t.id })) },
      },
    });

    for (const file of files) {
      const key = `${projectRootPrefix(project.clientId, form.projectId)}/tasks/${task.id}/${randomUUID()}${extname(file.originalname)}`;
      try {
        await this.storage.upload({ buffer: file.buffer, key, mimeType: file.mimetype });
        await this.prisma.taskAttachment.create({
          data: { taskId: task.id, uploadedById: who.user?.id ?? null, fileName: file.originalname.slice(0, 255), fileUrl: key, fileSize: file.size, mimeType: file.mimetype },
        });
      } catch (err) {
        this.logger.warn(`Form attachment upload failed for task ${task.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    await this.prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: who.user?.id ?? null,
        authorLabel: who.user ? null : who.name || who.email || form.name,
        kind: TaskCommentKind.SYSTEM,
        body: `submitted this task via the “${form.name}” form`,
      },
    });
    await this.events.follow(task.id, [who.user?.id, form.assigneeId, form.createdById]);

    const actor: UserContext = who.user ?? {
      id: '',
      email: who.email ?? 'form',
      firstName: who.name || who.email || form.name,
      role: 'GUEST' as UserContext['role'],
    };
    await this.events.notify(
      { id: task.id, name: task.name, projectId: form.projectId, project: { name: project.name } },
      actor,
      'task_form_submission',
      [form.createdById, form.assigneeId].filter((id): id is string => !!id),
      `New “${form.name}” submission: ${task.name}`,
      who.email ? `From ${who.name ? `${who.name} (${who.email})` : who.email}` : null,
    );

    if (!who.user && who.email && form.access === TaskFormAccess.OPEN) {
      void this.sendConfirmation(form, who, built.name, built.answered).catch((err) =>
        this.logger.warn(`Form confirmation email failed: ${err instanceof Error ? err.message : err}`),
      );
    }

    return {
      ok: true,
      taskId: task.id,
      message: form.confirmationMessage || 'Thanks! Your submission was received.',
      ...(who.user ? { route: ['tasks', 'projects', form.projectId, 'tasks', task.id] } : {}),
    };
  }

  private async sendConfirmation(
    form: TaskForm,
    who: { email: string | null; name: string | null },
    taskName: string,
    answered: { label: string; text: string }[],
  ) {
    if (!who.email) return;
    const rows = answered
      .slice(0, 20)
      .map(
        (a) =>
          `<p style="margin:0 0 10px;"><strong style="color:#2d2d2d;">${escapeEmailHtml(a.label)}</strong><br><span style="color:#4a4a4a;">${escapeEmailHtml(a.text.slice(0, 600)).replace(/\n/g, '<br>')}</span></p>`,
      )
      .join('');
    const html = wrapClientEmail({
      title: `We received your submission`,
      subtitle: form.name,
      greeting: who.name ? `Hi ${who.name},` : 'Hi,',
      intro: form.confirmationMessage || `Thanks for reaching out — we got “${taskName}” and will follow up if we need anything else.`,
      extraHtml: rows ? `<div style="margin-top:16px;font-size:14px;line-height:1.5;">${rows}</div>` : undefined,
    });
    const result = await this.mail.sendRaw({ to: who.email, subject: `We received your submission: ${taskName}`, html });
    if (!result.sent) this.logger.warn(`Form confirmation to ${who.email} failed: ${result.error}`);
  }

  private definition(form: TaskForm & { project?: { name: string } | null }, fields: Awaited<ReturnType<TaskFormsService['fieldsFor']>>) {
    return {
      slug: form.slug,
      name: form.name,
      description: form.description,
      access: form.access,
      projectName: form.project?.name ?? null,
      requiresSignIn: false,
      requiresEmail: form.access === TaskFormAccess.OPEN,
      questions: publicQuestions(withLiveFields((form.questions as unknown as FormQuestion[]) ?? [], fields)),
      maxFiles: FORM_MAX_FILES,
      maxFileBytes: FORM_MAX_FILE_BYTES,
    };
  }

  private async bySlug(slug: string) {
    const form = await this.prisma.taskForm.findUnique({
      where: { slug: slugify(slug) },
      include: { project: { select: { name: true, inTaskManager: true } } },
    });
    if (!form || !form.isActive || !form.project?.inTaskManager) throw new NotFoundException('This form is not available');
    return form;
  }

  private assertKey(form: TaskForm, key?: string | null) {
    if (!key || !form.apiKeyHash || hashKey(key.trim()) !== form.apiKeyHash) {
      throw new UnauthorizedException('A valid form API key is required');
    }
  }

  private async assertCollaborator(user: UserContext, form: TaskForm) {
    if (!(await this.access.can(user, form.projectId, 'view'))) {
      throw new ForbiddenException("You don't have access to this form — it's only for people on this project");
    }
  }

  private async findOr404(formId: string) {
    const form = await this.prisma.taskForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private async fieldsFor(projectId: string) {
    const rows = await this.prisma.taskCustomField.findMany({ where: { projectId } });
    return rows.map((f) => ({ id: f.id, name: f.name, type: f.type as string, options: (f.options as FieldOption[] | null) ?? [] }));
  }

  private normalize(questions: unknown, fields: Awaited<ReturnType<TaskFormsService['fieldsFor']>>) {
    try {
      return normalizeQuestions(questions, fields);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid questions');
    }
  }

  private async settings(projectId: string, dto: Partial<CreateFormDto>) {
    const data: { sectionId?: string | null; assigneeId?: string | null; tagIds?: Prisma.InputJsonValue; confirmationMessage?: string | null } = {};
    if (dto.sectionId !== undefined) {
      if (dto.sectionId) {
        const s = await this.prisma.taskSection.findUnique({ where: { id: dto.sectionId }, select: { projectId: true } });
        if (!s || s.projectId !== projectId) throw new BadRequestException('Section is not in this project');
      }
      data.sectionId = dto.sectionId || null;
    }
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        const ok = await this.prisma.user.count({
          where: { id: dto.assigneeId, isActive: true, OR: [{ role: { in: ['ADMIN', 'MEMBER'] } }, { projectMemberships: { some: { projectId } } }] },
        });
        if (!ok) throw new BadRequestException('That person is not on this project');
      }
      data.assigneeId = dto.assigneeId || null;
    }
    if (dto.tagIds !== undefined) {
      const ids = Array.isArray(dto.tagIds) ? dto.tagIds.filter((t): t is string => typeof t === 'string') : [];
      data.tagIds = ids;
    }
    if (dto.confirmationMessage !== undefined) data.confirmationMessage = dto.confirmationMessage?.trim() || null;
    return data;
  }

  private async uniqueSlug(text: string) {
    const base = slugify(text);
    let slug = base;
    for (let i = 2; await this.prisma.taskForm.count({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  private parseObject(value: unknown): Record<string, unknown> | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        throw new BadRequestException('answers / submitter / context must be JSON objects');
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  private toDto(form: TaskForm, submissionCount: number, fields?: Awaited<ReturnType<TaskFormsService['fieldsFor']>>) {
    return {
      id: form.id,
      projectId: form.projectId,
      name: form.name,
      slug: form.slug,
      description: form.description,
      access: form.access,
      isActive: form.isActive,
      sectionId: form.sectionId,
      assigneeId: form.assigneeId,
      tagIds: Array.isArray(form.tagIds) ? (form.tagIds as string[]) : [],
      questions: fields ? withLiveFields((form.questions as unknown as FormQuestion[]) ?? [], fields) : ((form.questions as unknown as FormQuestion[]) ?? []),
      confirmationMessage: form.confirmationMessage,
      hasApiKey: !!form.apiKeyHash,
      apiKeyHint: form.apiKeyHint,
      submissionCount,
      createdAt: form.createdAt.toISOString(),
      updatedAt: form.updatedAt.toISOString(),
    };
  }
}

