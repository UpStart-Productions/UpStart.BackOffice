import { animate, style, transition, trigger } from '@angular/animations';
import { Component, computed, effect, ElementRef, HostListener, inject, input, OnDestroy, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuillModule } from 'ngx-quill';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { fileExtLabel, fileIconClass, isPdfFile, isRasterImage, isVideoFile } from '../../core/file-type.util';
import { FileViewerDialogComponent, type ViewerFile } from '../../ui/file-viewer/file-viewer-dialog.component';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../core/tm-api.service';
import { chipColors, createdOnLabel, dueLabel, dueTone, fileSizeLabel, recurrenceLabel, relativeTime } from '../core/tm-format.util';
import { isBlankHtml, mentionQuillModules } from '../core/tm-mentions';
import { EditorOverlayDismissGuard } from '../../core/editor-overlay-dismiss-guard.service';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import type Quill from 'quill';
import { TmStoreService } from '../core/tm-store.service';
import { isAdminRole, withinTaskCommentAuthorGrace } from '@upstart/back-office/shared';
import { Person, TaskAttachment, TaskComment, TaskDetail, TaskSummary } from '../core/tm.types';
import { TmDueDatePickerComponent } from './due-date-picker.component';
import { TmFieldCellComponent } from './field-cell.component';
import { TmPersonPickerComponent } from './person-picker.component';
import { TmRecurrenceEditorComponent } from './recurrence-editor.component';
import { TmAvatarComponent } from './tm-avatar.component';
import { TagPick, TmTagPickerComponent } from './tag-picker.component';
import { TmTaskProjectsComponent } from './task-projects.component';

/** Right-hand task detail pane (Asana-style). Driven by `taskId`; emits changes so lists stay in sync. */
@Component({
  selector: 'app-tm-task-detail',
  standalone: true,
  imports: [
    TmTagPickerComponent,
    TmTaskProjectsComponent,
    FormsModule,
    QuillModule,
    ButtonModule,
    SelectModule,
    TooltipModule,
    TmAvatarComponent,
    TmPersonPickerComponent,
    TmDueDatePickerComponent,
    TmRecurrenceEditorComponent,
    TmFieldCellComponent,
    FileViewerDialogComponent,
  ],
  templateUrl: './task-detail-panel.component.html',
  animations: [
    trigger('pane', [
      transition(':enter', [
        style({ transform: 'translateX(2rem)', opacity: 0 }),
        animate('220ms ease-out', style({ transform: 'translateX(0)', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(2rem)', opacity: 0 })),
      ]),
    ]),
  ],
  host: {
    class: 'tm-detail-host',
    '[@pane]': '',
  },
})
export class TmTaskDetailComponent implements OnDestroy {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly editorOverlayDismissGuard = inject(EditorOverlayDismissGuard);

  taskId = input.required<string>();
  closed = output<void>();
  /** A task (this one or a subtask) changed — parent lists should patch/reload. */
  changed = output<TaskSummary>();
  deleted = output<string>();
  /** The task was moved between / added to / removed from projects — lists should reload. */
  projectsChanged = output<string>();
  /** Navigate the pane to another task (subtask / parent). */
  openTask = output<string>();

  task = signal<TaskDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  people = signal<Person[]>([]);
  showActivity = signal(false);
  nameDraft = '';
  descriptionDraft = '';
  descriptionDirty = false;
  commentDraft = '';
  posting = signal(false);
  newSubtask = '';
  addingSubtask = signal(false);
  editingCommentId = signal<string | null>(null);
  editCommentDraft = '';
  uploading = signal(false);
  /** Files uploading now (spinner) or just finished (check), shown in the drop zone. */
  uploadProgress = signal<{ name: string; done: boolean }[]>([]);
  dragOver = signal(false);
  /** The photo, video or PDF open in the viewer. */
  previewAttachment = signal<TaskAttachment | null>(null);
  readonly preview = computed<ViewerFile | null>(() => {
    const a = this.previewAttachment();
    if (!a) return null;
    const kind = this.attachmentIsVideo(a) ? 'video' : this.attachmentIsPdf(a) ? 'pdf' : 'image';
    return { name: a.fileName, kind, url: resolveAssetUrl(a.url) };
  });
  commentComposerOpen = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly assigneePicker = viewChild.required<TmPersonPickerComponent>('assigneePicker');
  private readonly duePicker = viewChild.required<TmDueDatePickerComponent>('duePicker');
  private readonly recurrenceEditor = viewChild.required<TmRecurrenceEditorComponent>('recurrenceEditor');
  private readonly subtaskDuePicker = viewChild.required<TmDueDatePickerComponent>('subtaskDuePicker');
  private readonly subtaskAssigneePicker = viewChild.required<TmPersonPickerComponent>('subtaskAssigneePicker');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private subtaskTarget: TaskSummary | null = null;
  private loadSeq = 0;
  private loadedTaskId: string | null = null;
  private readonly commentEditor = viewChild<{ quillEditor: Quill }>('commentEditor');

  readonly meId = computed(() => this.session.me()?.id ?? null);
  readonly canEdit = computed(() => !!this.task()?.permissions.canEdit);
  readonly canComment = computed(() => !!this.task()?.permissions.canComment);
  readonly visibleComments = computed<TaskComment[]>(() => {
    const t = this.task();
    if (!t) return [];
    return this.showActivity() ? t.comments : t.comments.filter((c) => c.kind === 'COMMENT');
  });
  readonly activityCount = computed(() => this.task()?.comments.filter((c) => c.kind === 'SYSTEM').length ?? 0);
  /** Alternate stripe on user comments only (even index = plain, odd = tinted). */
  readonly commentStripeAlt = computed(() => {
    const alt = new Set<string>();
    let n = 0;
    for (const c of this.visibleComments()) {
      if (c.kind !== 'COMMENT') continue;
      if (n % 2 === 1) alt.add(c.id);
      n++;
    }
    return alt;
  });
  readonly mentionModules = computed(() => {
    const projectId = this.task()?.projectId;
    return mentionQuillModules(() => (projectId ? this.store.people(projectId) : Promise.resolve([])));
  });
  readonly commentModules = computed(() => {
    const projectId = this.task()?.projectId;
    return mentionQuillModules(() => (projectId ? this.store.people(projectId) : Promise.resolve([])), { toolbar: false });
  });

  readonly dueLabel = dueLabel;
  readonly dueTone = dueTone;
  readonly recurrenceLabel = recurrenceLabel;
  readonly relativeTime = relativeTime;
  readonly createdOnLabel = createdOnLabel;
  readonly fileSizeLabel = fileSizeLabel;
  readonly resolveAssetUrl = resolveAssetUrl;
  readonly chipColors = chipColors;

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => {
        // Flush an unsaved description edit on the task we're leaving.
        this.saveDescription();
        void this.load(id);
      });
    });
  }

  ngOnDestroy() {
    this.saveDescription();
  }

  /** Clicking the page behind the pane closes it. A task row switches tasks instead, and menus opened from the pane stay up. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.editorOverlayDismissGuard.shouldSuppressParentPaneDismissal()) return;
    const path = event.composedPath();
    if (path.some((node) => node === this.host.nativeElement)) return;
    const target = event.target;
    if (target instanceof Node && this.host.nativeElement.contains(target)) return;
    const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
    if (
      el?.closest(
        '.tm-row, .tm-detail-composer, .p-popover, .p-dialog, .p-dialog-mask, .p-select-overlay, .p-multiselect-overlay, .p-datepicker-panel, .mention-suggest-container, .ql-tooltip, .cdk-overlay-container, .cdk-dialog-container, .cdk-overlay-backdrop, .nmp-quill-icon-dialog-panel, .nmp-licon-dialog, nmp-lucide-icon-picker-dialog, .quill-person-card-picker-panel, .quill-person-card-picker',
      )
    ) {
      return;
    }
    this.closed.emit();
  }

  async load(id: string, quiet = false) {
    const seq = ++this.loadSeq;
    if (!quiet) {
      this.loading.set(true);
      this.error.set(null);
    }
    if (id !== this.loadedTaskId) {
      this.loadedTaskId = id;
      this.commentDraft = '';
      this.commentComposerOpen.set(false);
    }
    try {
      const task = await this.api.getTask(id);
      if (seq !== this.loadSeq) return;
      this.task.set(task);
      this.nameDraft = task.name;
      if (!this.descriptionDirty || !quiet) {
        this.descriptionDraft = task.description ?? '';
        this.descriptionDirty = false;
      }
      this.store.people(task.projectId).then((p) => this.people.set(p)).catch(() => undefined);
    } catch (err) {
      if (seq === this.loadSeq) this.error.set(err instanceof Error ? err.message : 'Could not load task');
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  private async patch(patch: Parameters<TmApiService['updateTask']>[1]) {
    const t = this.task();
    if (!t) return;
    try {
      const summary = await this.api.updateTask(t.id, patch);
      this.changed.emit(summary);
      await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown) {
    this.toast.add({ severity: 'error', summary: 'Something went wrong', detail: err instanceof Error ? err.message : String(err) });
  }

  // ── Header actions ──────────────────────────────────────────────────────

  toggleComplete() {
    const t = this.task();
    if (!t) return;
    this.task.set({ ...t, isCompleted: !t.isCompleted });
    void this.patch({ isCompleted: !t.isCompleted });
  }

  async toggleFollow() {
    const t = this.task();
    if (!t) return;
    try {
      await this.api.follow(t.id, !t.isFollowing);
      await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  async copyLink() {
    const t = this.task();
    if (!t) return;
    const url = `${location.origin}/tasks/projects/${t.projectId}/tasks/${t.id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.add({ severity: 'success', summary: 'Link copied', life: 2000 });
    } catch {
      this.toast.add({ severity: 'info', summary: 'Task link', detail: url });
    }
  }

  async onProjectsChanged() {
    const t = this.task();
    if (!t) return;
    await this.load(t.id, true);
    this.projectsChanged.emit(t.id);
  }

  // ── Tags ────────────────────────────────────────────────────────────────

  async addTag(pick: TagPick) {
    const t = this.task();
    if (!t) return;
    try {
      const tags = await this.api.addTaskTag(t.id, pick);
      this.store.rememberTags(tags);
      this.applyTags(tags);
    } catch (err) {
      this.fail(err);
    }
  }

  async removeTag(tagId: string) {
    const t = this.task();
    if (!t) return;
    this.applyTags(t.tags.filter((x) => x.id !== tagId));
    try {
      this.applyTags(await this.api.removeTaskTag(t.id, tagId));
    } catch (err) {
      this.fail(err);
      await this.load(t.id, true);
    }
  }

  private applyTags(tags: TaskDetail['tags']) {
    const t = this.task();
    if (!t) return;
    const next = { ...t, tags };
    this.task.set(next);
    this.changed.emit(next);
  }

  deleteTask() {
    const t = this.task();
    if (!t) return;
    this.confirm.confirm({
      header: 'Delete task?',
      message: `“${t.name}”${t.subtaskCount ? ` and its ${t.subtaskCount} subtask(s)` : ''} will be permanently deleted.`,
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.deleteTask(t.id);
          this.deleted.emit(t.id);
          if (t.parentTaskId) this.openTask.emit(t.parentTaskId);
          else this.closed.emit();
        } catch (err) {
          this.fail(err);
        }
      },
    });
  }

  // ── Fields ──────────────────────────────────────────────────────────────

  saveName() {
    const t = this.task();
    const next = this.nameDraft.trim();
    if (!t || !next || next === t.name) {
      this.nameDraft = t?.name ?? '';
      return;
    }
    this.task.set({ ...t, name: next });
    void this.patch({ name: next });
  }

  onNameKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    }
  }

  openAssignee(event: Event) {
    if (!this.canEdit()) return;
    this.assigneePicker().open(event, this.people(), this.task()?.assignee?.id ?? null);
  }

  setAssignee(p: Person | null) {
    const t = this.task();
    if (!t) return;
    this.task.set({ ...t, assignee: p });
    void this.patch({ assigneeId: p?.id ?? null });
  }

  openDue(event: Event) {
    if (!this.canEdit()) return;
    this.duePicker().open(event, this.task()?.dueOn ?? null);
  }

  setDue(key: string | null) {
    const t = this.task();
    if (!t) return;
    this.task.set({ ...t, dueOn: key });
    void this.patch({ dueOn: key });
  }

  openRecurrence(event: Event) {
    if (!this.canEdit()) return;
    this.recurrenceEditor().open(event, this.task()?.recurrence ?? null);
  }

  setRecurrence(rule: TaskDetail['recurrence']) {
    void this.patch({ recurrence: rule });
  }

  async setField(fieldId: string, value: unknown) {
    const t = this.task();
    if (!t) return;
    this.task.set({ ...t, fields: { ...t.fields, [fieldId]: value } });
    try {
      const summary = await this.api.setField(t.id, fieldId, value);
      this.changed.emit(summary);
    } catch (err) {
      this.fail(err);
      await this.load(t.id, true);
    }
  }

  onDescriptionChange(html: string | null) {
    this.descriptionDraft = html ?? '';
    this.descriptionDirty = true;
  }

  saveDescription() {
    const t = this.task();
    if (!t || !this.descriptionDirty) return;
    this.descriptionDirty = false;
    const next = isBlankHtml(this.descriptionDraft) ? null : this.descriptionDraft;
    if ((next ?? null) === (t.description ?? null)) return;
    void this.patch({ description: next });
  }

  // ── Subtasks ────────────────────────────────────────────────────────────

  startSubtask() {
    this.addingSubtask.set(true);
    this.newSubtask = '';
    setTimeout(() => {
      const input = document.querySelector('.tm-subtask-new-input') as HTMLInputElement | null;
      input?.focus();
      input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  cancelSubtask() {
    this.addingSubtask.set(false);
    this.newSubtask = '';
  }

  async addSubtask() {
    const t = this.task();
    const name = this.newSubtask.trim();
    if (!t || !name) return;
    this.newSubtask = '';
    // Keep the input open for the next subtask (Asana behavior).
    setTimeout(() => (document.querySelector('.tm-subtask-new-input') as HTMLInputElement | null)?.focus(), 0);
    try {
      const created = await this.api.createTask({ projectId: t.projectId, parentTaskId: t.id, name });
      this.task.set({ ...t, subtasks: [...t.subtasks, created], subtaskCount: t.subtaskCount + 1 });
      void this.load(t.id, true);
      this.changed.emit({ ...t, subtaskCount: t.subtaskCount + 1 });
    } catch (err) {
      this.fail(err);
    }
  }

  async toggleSubtask(sub: TaskSummary) {
    const t = this.task();
    if (!t) return;
    this.task.set({ ...t, subtasks: t.subtasks.map((s) => (s.id === sub.id ? { ...s, isCompleted: !s.isCompleted } : s)) });
    try {
      await this.api.updateTask(sub.id, { isCompleted: !sub.isCompleted });
      await this.load(t.id, true);
      const fresh = this.task();
      if (fresh) this.changed.emit(fresh);
    } catch (err) {
      this.fail(err);
    }
  }

  async renameSubtask(sub: TaskSummary, name: string) {
    const next = name.trim();
    if (!next || next === sub.name) return;
    try {
      await this.api.updateTask(sub.id, { name: next });
    } catch (err) {
      this.fail(err);
    }
  }

  openSubtaskAssignee(event: Event, sub: TaskSummary) {
    this.subtaskTarget = sub;
    this.subtaskAssigneePicker().open(event, this.people(), sub.assignee?.id ?? null);
  }

  async setSubtaskAssignee(p: Person | null) {
    const sub = this.subtaskTarget;
    const t = this.task();
    if (!sub || !t) return;
    try {
      await this.api.updateTask(sub.id, { assigneeId: p?.id ?? null });
      await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  openSubtaskDue(event: Event, sub: TaskSummary) {
    this.subtaskTarget = sub;
    this.subtaskDuePicker().open(event, sub.dueOn);
  }

  async setSubtaskDue(key: string | null) {
    const sub = this.subtaskTarget;
    const t = this.task();
    if (!sub || !t) return;
    try {
      await this.api.updateTask(sub.id, { dueOn: key });
      await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  // ── Attachments ─────────────────────────────────────────────────────────

  pickFile() {
    this.fileInput()?.nativeElement.click();
  }

  async onFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    await this.uploadFiles(files);
  }

  onDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    const zone = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && zone.contains(event.relatedTarget)) return;
    this.dragOver.set(false);
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver.set(false);
    await this.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  attachmentIsImage(a: TaskAttachment) {
    return isRasterImage(a.fileName, a.mimeType);
  }

  attachmentIsVideo(a: TaskAttachment) {
    return isVideoFile(a.fileName, a.mimeType);
  }

  attachmentIsPdf(a: TaskAttachment) {
    return isPdfFile(a.fileName, a.mimeType);
  }

  /** Photos, videos and PDFs open in a viewer; other files open in a new tab (so does Cmd/Ctrl-click). */
  openAttachment(a: TaskAttachment, event: MouseEvent) {
    if (a.isLink || event.metaKey || event.ctrlKey) return;
    const pdf = this.attachmentIsPdf(a);
    if (!pdf && !this.attachmentIsImage(a) && !this.attachmentIsVideo(a)) return;
    event.preventDefault();
    this.previewAttachment.set(a);
  }

  attachmentIcon(a: TaskAttachment) {
    return fileIconClass(a.fileName, a.mimeType);
  }

  attachmentExt(a: TaskAttachment) {
    return fileExtLabel(a.fileName);
  }

  /** Upload one at a time, each with a spinner then a check in the drop zone; the cards appear when all are in. */
  private async uploadFiles(files: File[]) {
    const t = this.task();
    if (!t || !files.length || this.uploading()) return;
    this.uploading.set(true);
    this.uploadProgress.set(files.map((f) => ({ name: f.name, done: false })));
    try {
      for (const [i, file] of files.entries()) {
        await this.api.uploadAttachment(t.id, file);
        this.uploadProgress.update((list) => list.map((p, j) => (j === i ? { ...p, done: true } : p)));
      }
      await this.load(t.id, true);
      const fresh = this.task();
      if (fresh) this.changed.emit(fresh);
    } catch (err) {
      this.fail(err);
    } finally {
      this.uploading.set(false);
      this.uploadProgress.set([]);
    }
  }

  async removeAttachment(id: string) {
    const t = this.task();
    if (!t) return;
    try {
      await this.api.deleteAttachment(id);
      await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  // ── Comments ────────────────────────────────────────────────────────────

  openCommentComposer(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.editorOverlayDismissGuard.suppressParentPaneDismissal(400);
    this.commentComposerOpen.set(true);
    setTimeout(() => this.commentEditor()?.quillEditor?.focus(), 0);
  }

  async postComment() {
    const t = this.task();
    if (!t || isBlankHtml(this.commentDraft) || this.posting()) return;
    this.posting.set(true);
    try {
      const comment = await this.api.addComment(t.id, this.commentDraft);
      this.commentDraft = '';
      this.commentComposerOpen.set(false);
      this.task.set({ ...t, comments: [...t.comments, comment], commentCount: t.commentCount + 1 });
      void this.load(t.id, true);
      this.changed.emit({ ...t, commentCount: t.commentCount + 1 });
    } catch (err) {
      this.fail(err);
    } finally {
      this.posting.set(false);
    }
  }

  onCommentKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.postComment();
    }
  }

  startEditComment(c: TaskComment) {
    this.editingCommentId.set(c.id);
    this.editCommentDraft = c.body;
  }

  async saveEditComment(c: TaskComment) {
    if (isBlankHtml(this.editCommentDraft)) return;
    try {
      await this.api.updateComment(c.id, this.editCommentDraft);
      this.editingCommentId.set(null);
      const t = this.task();
      if (t) await this.load(t.id, true);
    } catch (err) {
      this.fail(err);
    }
  }

  deleteComment(c: TaskComment) {
    this.confirm.confirm({
      header: 'Delete comment?',
      message: 'This comment will be permanently deleted.',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.deleteComment(c.id);
          const t = this.task();
          if (t) await this.load(t.id, true);
        } catch (err) {
          this.fail(err);
        }
      },
    });
  }

  authorName(c: TaskComment): string {
    return c.author?.name ?? c.authorLabel ?? 'Someone';
  }

  isMine(c: TaskComment): boolean {
    return !!c.author && c.author.id === this.meId();
  }

  canEditComment(c: TaskComment): boolean {
    return c.kind === 'COMMENT' && this.isMine(c) && withinTaskCommentAuthorGrace(c.createdAt);
  }

  canDeleteComment(c: TaskComment): boolean {
    if (c.kind !== 'COMMENT') return false;
    const role = this.session.me()?.role;
    if (role && isAdminRole(role)) return true;
    return this.isMine(c) && withinTaskCommentAuthorGrace(c.createdAt);
  }

  onDescriptionEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const projectId = this.task()?.project.id;
      return projectId ? { type: 'tmProject', projectId } : { type: 'crm' };
    });
  }

  onCommentComposerEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const projectId = this.task()?.project.id;
      return projectId ? { type: 'tmProject', projectId } : { type: 'crm' };
    });
    if (this.commentComposerOpen()) {
      quill.focus();
    }
  }
}
