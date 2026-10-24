export type ProjectTask = {
  id: string;
  projectId: string;
  name: string;
  source?: 'MANUAL' | 'ASANA';
  asanaTaskGid?: string | null;
  isBillable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type Project = {
  id: string;
  name: string;
  isActive?: boolean;
  client: { id: string; name: string } | null;
  asanaSectionGid?: string | null;
  tasks?: ProjectTask[];
};

export type TimeEntryTask = {
  id: string;
  name: string;
  parent?: { id: string; name: string } | null;
};

export type TimeEntry = {
  id: string;
  description?: string;
  startedAt: string;
  stoppedAt?: string;
  durationMin?: number;
  isBillable: boolean;
  projectTaskId?: string;
  taskId?: string | null;
  /** Optional: time can be logged without a project. */
  project: Project | null;
  /** The project's client, or one picked directly when there is no project. */
  client?: { id: string; name: string } | null;
  user?: { id: string; firstName?: string | null; lastName?: string | null; email: string } | null;
  projectTask?: { id: string; name: string; isBillable: boolean; source?: 'MANUAL' | 'ASANA' } | null;
  task?: TimeEntryTask | null;
};

export type TmTaskSearchHit = {
  id: string;
  name: string;
  project: { id: string; name: string };
  parent: { id: string; name: string } | null;
};

export type TmTaskOption = TmTaskSearchHit & { label: string };

export type ProjectTaskDraft = {
  id?: string;
  name: string;
  source?: 'MANUAL' | 'ASANA';
  isBillable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export const SUGGESTED_PROJECT_TASKS: Pick<ProjectTaskDraft, 'name' | 'isBillable'>[] = [
  { name: 'Meetings', isBillable: false },
  { name: 'Project Management', isBillable: true },
  { name: 'Development', isBillable: true },
  { name: 'Graphic Design', isBillable: true },
];

/** A client the user can log time or invoice against (name only). */
export type ClientOption = { id: string; name: string };
