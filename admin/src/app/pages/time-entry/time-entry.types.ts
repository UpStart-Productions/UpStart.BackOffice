export type ProjectTask = {
  id: string;
  projectId: string;
  name: string;
  isBillable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type Project = {
  id: string;
  name: string;
  client: { id: string; name: string };
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
  projectTask?: { id: string; name: string; isBillable: boolean } | null;
};

export type ProjectTaskDraft = {
  id?: string;
  name: string;
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
