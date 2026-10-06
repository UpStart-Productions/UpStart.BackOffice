export type Person = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
};

export type MemberRole = 'OWNER' | 'EDITOR' | 'COMMENTER';
export type ProjectMember = Person & { memberRole: MemberRole; invitePending: boolean };

export type TmProjectListItem = {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
  isBillable: boolean;
  client: { id: string; name: string } | null;
  isStarred: boolean;
  starOrder: number | null;
  myRole: MemberRole | null;
  memberCount: number;
  openTaskCount: number;
};

export type TmSection = { id: string; name: string; sortOrder: number; isCollapsed: boolean };

export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX';
export type FieldOption = { id: string; label: string; color?: string };
export type TmField = { id: string; projectId: string; name: string; type: FieldType; options: FieldOption[]; sortOrder: number };

export type TmProject = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  isBillable: boolean;
  client: { id: string; name: string } | null;
  isStarred: boolean;
  sections: TmSection[];
  customFields: TmField[];
  members: ProjectMember[];
  permissions: { canEdit: boolean; canComment: boolean; canManage: boolean; isStaff: boolean };
};

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number;
  weekdays?: number[];
  mode: 'ON_COMPLETE' | 'ON_SCHEDULE';
};

export type TaskSummary = {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  name: string;
  assignee: Person | null;
  dueOn: string | null;
  dueAt: string | null;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  recurrence: Recurrence | null;
  subtaskCount: number;
  completedSubtaskCount: number;
  commentCount: number;
  attachmentCount: number;
  fields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MyTask = TaskSummary & {
  project: { id: string; name: string; color: string | null };
  parent: { id: string; name: string } | null;
};

export type TaskComment = {
  id: string;
  taskId: string;
  kind: 'COMMENT' | 'SYSTEM';
  body: string;
  author: Person | null;
  authorLabel: string | null;
  editedAt: string | null;
  createdAt: string;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  fileName: string;
  url: string | null;
  isLink: boolean;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: Person | null;
  createdAt: string;
};

export type TaskDetail = TaskSummary & {
  description: string | null;
  project: { id: string; name: string; color: string | null };
  customFields: TmField[];
  section: { id: string; name: string } | null;
  parent: { id: string; name: string; parentTaskId: string | null } | null;
  createdBy: Person | null;
  completedBy: Person | null;
  followers: Person[];
  isFollowing: boolean;
  attachments: TaskAttachment[];
  comments: TaskComment[];
  subtasks: TaskSummary[];
  permissions: { canEdit: boolean; canComment: boolean };
};

export type NotificationMeta = {
  entityType?: string;
  entityId?: string;
  route?: string[];
  actorUserId?: string;
  actorLabel?: string;
  projectId?: string;
  projectName?: string;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  meta: NotificationMeta | null;
  readAt: string | null;
  createdAt: string;
};

export type EmailPrefs = Record<'task_assigned' | 'task_mention' | 'task_comment' | 'task_completed' | 'project_added', boolean>;
