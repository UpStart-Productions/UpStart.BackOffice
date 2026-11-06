import { areaLevel, type EmailPreferences, type MeDto, type NotificationType } from '@upstart/back-office/shared';

export type EmailPrefRow = { key: NotificationType; label: string };

export type EmailPrefGroup = { id: string; label: string; rows: EmailPrefRow[] };

const TASK_ROWS: EmailPrefRow[] = [
  { key: 'task_assigned', label: 'A task is assigned to me' },
  { key: 'task_unassigned', label: "I'm unassigned from a task" },
  { key: 'task_mention', label: 'Someone @mentions me on a task' },
  { key: 'task_comment', label: 'Comments on tasks I follow' },
  { key: 'task_attachment', label: 'Files attached to tasks I follow' },
  { key: 'task_due_date_changed', label: 'Due dates change on tasks I follow' },
  { key: 'task_moved', label: 'Tasks I follow are moved' },
  { key: 'task_subtask_added', label: 'Subtasks are added to tasks I follow' },
  { key: 'task_completed', label: 'Tasks I follow are completed' },
  { key: 'task_form_submission', label: 'A task form I own gets a submission' },
];

const PROJECT_ROWS: EmailPrefRow[] = [
  { key: 'project_added', label: "I'm added to a project" },
  { key: 'project_removed', label: "I'm removed from a project" },
];

const ACTIVITY_ROWS: EmailPrefRow[] = [
  { key: 'activity_forwarded', label: 'Someone forwards activity to me' },
  { key: 'activity_mention', label: 'Someone @mentions me in activity' },
];

const CRM_FORM_ROWS: EmailPrefRow[] = [
  { key: 'client_form_submitted', label: 'A client form I can edit is submitted' },
  { key: 'form_attached', label: 'A form is added to a client assigned to me' },
];

/** Groups for My Account email toggles, filtered by module access. Empty groups are omitted. */
export function emailNotificationPrefGroups(me: MeDto | null | undefined): EmailPrefGroup[] {
  const groups: EmailPrefGroup[] = [
    { id: 'tasks', label: 'Tasks', rows: [...TASK_ROWS] },
    { id: 'projects', label: 'Projects', rows: [...PROJECT_ROWS] },
    { id: 'activity', label: 'Activity', rows: [...ACTIVITY_ROWS] },
  ];

  const formRows: EmailPrefRow[] = [...CRM_FORM_ROWS];
  if (areaLevel(me, 'forms')) {
    formRows.unshift({ key: 'form_submission', label: 'A form in Forms gets a submission' });
  }
  groups.push({ id: 'forms', label: 'Forms', rows: formRows });

  const careRows: EmailPrefRow[] = [];
  if (areaLevel(me, 'care')) {
    careRows.push({ key: 'care_form_submission', label: 'A care form gets a submission' });
  }
  if (areaLevel(me, 'schedule')) {
    careRows.push({ key: 'care_shift_assigned', label: 'A shift is assigned to me' });
  }
  if (careRows.length) {
    groups.push({ id: 'care', label: 'Care', rows: careRows });
  }

  return groups.filter((g) => g.rows.length > 0);
}

export type EmailPrefsState = EmailPreferences;
