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
  client: { id: string; name: string };
  asanaSectionGid?: string | null;
  tasks?: ProjectTask[];
};

export type TimeEntry = {
  id: string;
  description?: string;
  startedAt: string;
  stoppedAt?: string;
  durationMin?: number;
  isBillable: boolean;
  projectTaskId?: string;
  project: Project;
  projectTask?: { id: string; name: string; isBillable: boolean; source?: 'MANUAL' | 'ASANA' } | null;
};

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
