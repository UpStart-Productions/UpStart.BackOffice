import { inject, Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';
import {
  AppNotification,
  EmailPrefs,
  FieldOption,
  FieldType,
  MemberRole,
  MyTask,
  Person,
  Recurrence,
  TaskAttachment,
  TaskComment,
  TaskDetail,
  TaskSummary,
  TmField,
  TmProject,
  TmProjectListItem,
  TmSection,
} from './tm.types';

export type TaskPatch = Partial<{
  name: string;
  description: string | null;
  assigneeId: string | null;
  dueOn: string | null;
  isCompleted: boolean;
  recurrence: Recurrence | null;
}>;

/** Thin typed wrapper over the /tm and /notifications API. */
@Injectable({ providedIn: 'root' })
export class TmApiService {
  private readonly api = inject(ApiService);

  // Projects
  listProjects(archived = false) {
    return this.api.get<TmProjectListItem[]>(`/tm/projects${archived ? '?archived=true' : ''}`);
  }
  getProject(id: string) {
    return this.api.get<TmProject>(`/tm/projects/${id}`);
  }
  /** Existing projects (from the Projects page) not yet in Tasks. */
  availableProjects() {
    return this.api.get<{ id: string; name: string; client: { id: string; name: string } | null }[]>('/tm/available-projects');
  }
  addProject(id: string, color?: string | null) {
    return this.api.put<TmProject>(`/tm/projects/${id}/tasks-enabled`, { color: color ?? null });
  }
  removeProject(id: string) {
    return this.api.delete(`/tm/projects/${id}/tasks-enabled`);
  }
  updateProject(id: string, body: { color: string | null }) {
    return this.api.patch<TmProject>(`/tm/projects/${id}`, body);
  }
  star(id: string, starred: boolean) {
    return starred ? this.api.put(`/tm/projects/${id}/star`) : this.api.delete(`/tm/projects/${id}/star`);
  }
  people(projectId?: string) {
    return this.api.get<Person[]>(projectId ? `/tm/projects/${projectId}/people` : '/tm/people');
  }
  addMember(projectId: string, userId: string, role: MemberRole) {
    return this.api.post<TmProject>(`/tm/projects/${projectId}/members`, { userId, role });
  }
  /** Share by email — adds existing people, or creates a guest and emails an invite. */
  invite(projectId: string, email: string, role: MemberRole) {
    return this.api.post<{ project: TmProject; invited: boolean; emailed: boolean }>(`/tm/projects/${projectId}/invite`, { email, role });
  }
  resendInvite(projectId: string, userId: string) {
    return this.api.post<{ resent: boolean; emailed: boolean }>(`/tm/projects/${projectId}/members/${userId}/resend-invite`);
  }
  updateMember(projectId: string, userId: string, role: MemberRole) {
    return this.api.patch<TmProject>(`/tm/projects/${projectId}/members/${userId}`, { role });
  }
  removeMember(projectId: string, userId: string) {
    return this.api.delete(`/tm/projects/${projectId}/members/${userId}`);
  }

  // Sections
  createSection(projectId: string, name: string, afterSectionId?: string | null) {
    return this.api.post<TmSection>(`/tm/projects/${projectId}/sections`, {
      name,
      ...(afterSectionId !== undefined && { afterSectionId }),
    });
  }
  updateSection(id: string, body: Partial<{ name: string; isCollapsed: boolean }>) {
    return this.api.patch<TmSection>(`/tm/sections/${id}`, body);
  }
  moveSection(id: string, afterSectionId: string | null) {
    return this.api.post<{ id: string; sortOrder: number }>(`/tm/sections/${id}/move`, { afterSectionId });
  }
  deleteSection(id: string) {
    return this.api.delete<{ deleted: boolean; movedToSectionId: string | null }>(`/tm/sections/${id}`);
  }

  // Fields
  createField(projectId: string, body: { name: string; type: FieldType; options?: FieldOption[] }) {
    return this.api.post<TmField>(`/tm/projects/${projectId}/fields`, body);
  }
  updateField(id: string, body: Partial<{ name: string; options: FieldOption[]; sortOrder: number }>) {
    return this.api.patch<TmField>(`/tm/fields/${id}`, body);
  }
  deleteField(id: string) {
    return this.api.delete(`/tm/fields/${id}`);
  }

  // Tasks
  listTasks(projectId: string, completed: 'incomplete' | 'completed' | 'all' = 'all') {
    return this.api.get<TaskSummary[]>(`/tm/projects/${projectId}/tasks?completed=${completed}`);
  }
  myTasks(completedDays = 0) {
    return this.api.get<MyTask[]>(`/tm/my-tasks${completedDays ? `?completedDays=${completedDays}` : ''}`);
  }
  getTask(id: string) {
    return this.api.get<TaskDetail>(`/tm/tasks/${id}`);
  }
  createTask(body: {
    projectId: string;
    name: string;
    sectionId?: string | null;
    parentTaskId?: string | null;
    afterTaskId?: string | null;
    assigneeId?: string | null;
    dueOn?: string | null;
  }) {
    return this.api.post<TaskSummary>('/tm/tasks', body);
  }
  updateTask(id: string, patch: TaskPatch) {
    return this.api.patch<TaskSummary>(`/tm/tasks/${id}`, patch);
  }
  moveTask(id: string, body: { sectionId?: string | null; afterTaskId?: string | null; projectId?: string }) {
    return this.api.post<TaskSummary>(`/tm/tasks/${id}/move`, body);
  }
  deleteTask(id: string) {
    return this.api.delete(`/tm/tasks/${id}`);
  }
  setField(taskId: string, fieldId: string, value: unknown) {
    return this.api.put<TaskSummary>(`/tm/tasks/${taskId}/fields/${fieldId}`, { value });
  }
  follow(taskId: string, following: boolean, userId = 'me') {
    return following
      ? this.api.put(`/tm/tasks/${taskId}/followers/${userId}`)
      : this.api.delete(`/tm/tasks/${taskId}/followers/${userId}`);
  }
  addComment(taskId: string, body: string) {
    return this.api.post<TaskComment>(`/tm/tasks/${taskId}/comments`, { body });
  }
  updateComment(id: string, body: string) {
    return this.api.patch<TaskComment>(`/tm/comments/${id}`, { body });
  }
  deleteComment(id: string) {
    return this.api.delete(`/tm/comments/${id}`);
  }
  uploadAttachment(taskId: string, file: File) {
    return this.api.uploadFile<TaskAttachment>(`/tm/tasks/${taskId}/attachments`, file);
  }
  deleteAttachment(id: string) {
    return this.api.delete(`/tm/attachments/${id}`);
  }

  // Notifications
  notifications(archived = false) {
    return this.api.get<{ notifications: AppNotification[] }>(`/notifications?limit=100${archived ? '&archived=true' : ''}`);
  }
  unreadCount() {
    return this.api.get<{ count: number }>('/notifications/unread-count');
  }
  markRead(id: string, read = true) {
    return this.api.patch(`/notifications/${id}/read`, { read });
  }
  markAllRead() {
    return this.api.post('/notifications/read-all');
  }
  archiveNotification(id: string) {
    return this.api.delete(`/notifications/${id}`);
  }
  emailPrefs() {
    return this.api.get<{ email: EmailPrefs }>('/notifications/preferences');
  }
  setEmailPrefs(prefs: Partial<EmailPrefs>) {
    return this.api.put<{ email: EmailPrefs }>('/notifications/preferences', prefs);
  }
}
