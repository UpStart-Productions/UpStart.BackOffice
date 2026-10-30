import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { UserContext } from '../common/app.types';
import {
  AddMemberDto,
  AddTaskProjectDto,
  AddTaskTagDto,
  CreateTagDto,
  CreateFormDto,
  SubmitFormDto,
  UpdateFormDto,
  UpdateTagDto,
  CreateCommentDto,
  CreateFieldDto,
  CreateSectionDto,
  CreateTaskDto,
  AddToTasksDto,
  InviteMemberDto,
  MoveSectionDto,
  MoveTaskDto,
  SetFieldValueDto,
  TaskListQueryDto,
  TaskReportQueryDto,
  TaskSearchQueryDto,
  UpdateCommentDto,
  UpdateFieldDto,
  UpdateMemberDto,
  UpdateSectionDto,
  UpdateTaskDto,
  UpdateTmProjectDto,
} from './dto/task-manager.dto';
import { SyncProjectContactsDto } from '../projects/dto/project-contact.dto';
import { TaskProjectsService } from './task-projects.service';
import { TaskTagsService } from './task-tags.service';
import { FORM_MAX_FILE_BYTES, FORM_MAX_FILES, TaskFormsService } from './task-forms.service';
import { MAX_ATTACHMENT_BYTES, TasksService } from './tasks.service';
import { AccessGuard, Area, Action } from '../access/access.guard';

const me = (req: Request) => req.user as UserContext;

/** Task Manager API. All routes under /tm. Tasks at 'all' see every project; 'own' only projects they are a member of. */
@ApiTags('task-manager')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('tasks')
@Controller('tm')
export class TaskManagerController {
  constructor(
    private readonly projects: TaskProjectsService,
    private readonly tasks: TasksService,
    private readonly tags: TaskTagsService,
    private readonly forms: TaskFormsService,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  @Get('projects')
  @ApiQuery({ name: 'archived', required: false })
  listProjects(@Req() req: Request, @Query('archived') archived?: string) {
    return this.projects.list(me(req), archived === 'true');
  }

  /** Existing projects that can be added to Tasks (Tasks at 'all'). */
  @Get('available-projects')
  availableProjects(@Req() req: Request) {
    return this.projects.available(me(req));
  }

  /** Add an existing project to Tasks. */
  @Action('edit')
  @Put('projects/:id/tasks-enabled')
  addProject(@Req() req: Request, @Param('id') id: string, @Body() dto: AddToTasksDto) {
    return this.projects.addToTaskManager(me(req), id, dto?.color, dto?.icon);
  }

  /** Remove a project from Tasks (data kept). */
  @Action('edit')
  @Delete('projects/:id/tasks-enabled')
  removeProject(@Req() req: Request, @Param('id') id: string) {
    return this.projects.removeFromTaskManager(me(req), id);
  }

  @Get('projects/:id')
  getProject(@Req() req: Request, @Param('id') id: string) {
    return this.projects.get(me(req), id);
  }

  @Patch('projects/:id')
  updateProject(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTmProjectDto) {
    return this.projects.update(me(req), id, dto);
  }

  @Action('view')
  @Put('projects/:id/star')
  star(@Req() req: Request, @Param('id') id: string) {
    return this.projects.setStar(me(req), id, true);
  }

  @Action('view')
  @Delete('projects/:id/star')
  unstar(@Req() req: Request, @Param('id') id: string) {
    return this.projects.setStar(me(req), id, false);
  }

  @Get('projects/:id/tasks')
  listTasks(@Req() req: Request, @Param('id') id: string, @Query() query: TaskListQueryDto) {
    return this.tasks.listForProject(me(req), id, query.completed ?? 'all');
  }

  @Get('projects/:id/people')
  projectPeople(@Req() req: Request, @Param('id') id: string) {
    return this.projects.people(me(req), id);
  }

  /** Share dialog picker: the whole team, including people who can't see this board yet. */
  @Get('projects/:id/share-candidates')
  shareCandidates(@Req() req: Request, @Param('id') id: string) {
    return this.projects.shareCandidates(me(req), id);
  }

  /** Client-side project contacts (same list as on the Projects page). */
  @Action('edit')
  @Put('projects/:id/contacts')
  syncProjectContacts(@Req() req: Request, @Param('id') id: string, @Body() dto: SyncProjectContactsDto) {
    return this.projects.syncContacts(me(req), id, dto.contacts);
  }

  @Get('people')
  people(@Req() req: Request) {
    return this.projects.people(me(req));
  }

  // ── Members ───────────────────────────────────────────────────────────────

  @Action('edit')
  @Post('projects/:id/members')
  addMember(@Req() req: Request, @Param('id') id: string, @Body() dto: AddMemberDto) {
    return this.projects.addMember(me(req), id, dto);
  }

  /** Share by email (creates a guest + emails an invite when the address is new). */
  @Action('edit')
  @Post('projects/:id/invite')
  invite(@Req() req: Request, @Param('id') id: string, @Body() dto: InviteMemberDto) {
    return this.projects.invite(me(req), id, dto);
  }

  @Action('edit')
  @Post('projects/:id/members/:userId/resend-invite')
  resendInvite(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.resendInvite(me(req), id, userId);
  }

  @Patch('projects/:id/members/:userId')
  updateMember(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateMemberDto) {
    return this.projects.updateMember(me(req), id, userId, dto.role);
  }

  @Action('edit')
  @Delete('projects/:id/members/:userId')
  removeMember(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(me(req), id, userId);
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  @Post('projects/:id/sections')
  createSection(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateSectionDto) {
    return this.projects.createSection(me(req), id, dto);
  }

  @Patch('sections/:id')
  updateSection(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSectionDto) {
    return this.projects.updateSection(me(req), id, dto);
  }

  @Action('edit')
  @Post('sections/:id/move')
  moveSection(@Req() req: Request, @Param('id') id: string, @Body() dto: MoveSectionDto) {
    return this.projects.moveSection(me(req), id, dto.afterSectionId);
  }

  @Delete('sections/:id')
  deleteSection(@Req() req: Request, @Param('id') id: string) {
    return this.projects.deleteSection(me(req), id);
  }

  // ── Custom fields ─────────────────────────────────────────────────────────

  @Post('projects/:id/fields')
  createField(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateFieldDto) {
    return this.projects.createField(me(req), id, dto);
  }

  @Patch('fields/:id')
  updateField(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.projects.updateField(me(req), id, dto);
  }

  @Delete('fields/:id')
  deleteField(@Req() req: Request, @Param('id') id: string) {
    return this.projects.deleteField(me(req), id);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  @Get('reports/tasks')
  taskReport(@Req() req: Request, @Query() query: TaskReportQueryDto) {
    return this.tasks.report(
      me(req),
      new Date(query.from),
      new Date(query.to),
      query.projectId,
      query.clientId,
    );
  }

  @Get('my-tasks')
  @ApiQuery({ name: 'completedDays', required: false })
  myTasks(@Req() req: Request, @Query('completedDays') completedDays?: string) {
    const days = Math.min(Math.max(Number(completedDays) || 0, 0), 90);
    return this.tasks.myTasks(me(req), days);
  }

  @Post('tasks')
  createTask(@Req() req: Request, @Body() dto: CreateTaskDto) {
    return this.tasks.create(me(req), dto);
  }

  @Get('tasks/search')
  searchTasks(@Req() req: Request, @Query() query: TaskSearchQueryDto) {
    return this.tasks.search(me(req), query.q, query.projectId, query.sectionId, query.limit);
  }

  @Get('tasks/:id')
  getTask(@Req() req: Request, @Param('id') id: string) {
    return this.tasks.get(me(req), id);
  }

  @Patch('tasks/:id')
  updateTask(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(me(req), id, dto);
  }

  @Action('edit')
  @Post('tasks/:id/move')
  moveTask(@Req() req: Request, @Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.tasks.move(me(req), id, dto);
  }

  /** Also list a task in another project. */
  @Action('edit')
  @Post('tasks/:id/projects')
  addTaskProject(@Req() req: Request, @Param('id') id: string, @Body() dto: AddTaskProjectDto) {
    return this.tasks.addProject(me(req), id, dto);
  }

  @Action('edit')
  @Delete('tasks/:id/projects/:projectId')
  removeTaskProject(@Req() req: Request, @Param('id') id: string, @Param('projectId') projectId: string) {
    return this.tasks.removeProject(me(req), id, projectId);
  }

  // ── Forms ─────────────────────────────────────────────────────────────────

  @Get('projects/:id/forms')
  listForms(@Req() req: Request, @Param('id') id: string) {
    return this.forms.list(me(req), id);
  }

  @Post('projects/:id/forms')
  createForm(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateFormDto) {
    return this.forms.create(me(req), id, dto);
  }

  @Get('forms/:formId')
  getForm(@Req() req: Request, @Param('formId') formId: string) {
    return this.forms.get(me(req), formId);
  }

  @Patch('forms/:formId')
  updateForm(@Req() req: Request, @Param('formId') formId: string, @Body() dto: UpdateFormDto) {
    return this.forms.update(me(req), formId, dto);
  }

  @Delete('forms/:formId')
  deleteForm(@Req() req: Request, @Param('formId') formId: string) {
    return this.forms.remove(me(req), formId);
  }

  /** Issue a new API key (returned once; replaces the old one). */
  @Action('edit')
  @Post('forms/:formId/api-key')
  rotateFormKey(@Req() req: Request, @Param('formId') formId: string) {
    return this.forms.rotateKey(me(req), formId);
  }

  /** Collaborator-only forms: definition + submit for a signed-in project member. */
  @Get('f/:slug')
  collaboratorForm(@Req() req: Request, @Param('slug') slug: string) {
    return this.forms.collaboratorDefinition(me(req), slug);
  }

  @Post('f/:slug/submit')
  @ApiConsumes('application/json', 'multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', FORM_MAX_FILES, { storage: memoryStorage(), limits: { fileSize: FORM_MAX_FILE_BYTES } }))
  submitCollaboratorForm(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @UploadedFiles() files: { buffer: Buffer; mimetype: string; originalname: string; size: number }[] | undefined,
  ) {
    return this.forms.submitAsCollaborator(me(req), slug, dto, files ?? []);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  @Get('tags')
  listTags() {
    return this.tags.list();
  }

  @Post('tags')
  createTag(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch('tags/:tagId')
  updateTag(@Req() req: Request, @Param('tagId') tagId: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(me(req), tagId, dto);
  }

  @Delete('tags/:tagId')
  deleteTag(@Req() req: Request, @Param('tagId') tagId: string) {
    return this.tags.remove(me(req), tagId);
  }

  @Action('edit')
  @Post('tasks/:id/tags')
  addTaskTag(@Req() req: Request, @Param('id') id: string, @Body() dto: AddTaskTagDto) {
    return this.tags.addToTask(me(req), id, dto);
  }

  @Action('edit')
  @Delete('tasks/:id/tags/:tagId')
  removeTaskTag(@Req() req: Request, @Param('id') id: string, @Param('tagId') tagId: string) {
    return this.tags.removeFromTask(me(req), id, tagId);
  }

  @Delete('tasks/:id')
  deleteTask(@Req() req: Request, @Param('id') id: string) {
    return this.tasks.remove(me(req), id);
  }

  @Put('tasks/:id/fields/:fieldId')
  setField(@Req() req: Request, @Param('id') id: string, @Param('fieldId') fieldId: string, @Body() dto: SetFieldValueDto) {
    return this.tasks.setFieldValue(me(req), id, fieldId, dto.value);
  }

  @Action('view')
  @Put('tasks/:id/followers/:userId')
  follow(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    return this.tasks.setFollowing(me(req), id, userId === 'me' ? me(req).id : userId, true);
  }

  @Action('view')
  @Delete('tasks/:id/followers/:userId')
  unfollow(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    return this.tasks.setFollowing(me(req), id, userId === 'me' ? me(req).id : userId, false);
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  @Post('tasks/:id/comments')
  addComment(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.tasks.addComment(me(req), id, dto.body);
  }

  @Action('edit')
  @Patch('comments/:id')
  updateComment(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.tasks.updateComment(me(req), id, dto.body);
  }

  @Action('edit')
  @Delete('comments/:id')
  deleteComment(@Req() req: Request, @Param('id') id: string) {
    return this.tasks.deleteComment(me(req), id);
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  @Action('edit')
  @Post('tasks/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  upload(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.tasks.uploadAttachment(me(req), id, file);
  }

  @Action('edit')
  @Delete('attachments/:id')
  deleteAttachment(@Req() req: Request, @Param('id') id: string) {
    return this.tasks.deleteAttachment(me(req), id);
  }
}
