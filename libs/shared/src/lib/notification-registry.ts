import { areaLevel, type PermissionArea } from './permissions';
import type { MeDto } from './types';
import {
  EMAIL_OFF_BY_DEFAULT,
  NOTIFICATION_TYPES,
  type NotificationChannelSettings,
  type NotificationType,
} from './notifications';

export type NotificationChannel = keyof NotificationChannelSettings;

export type NotificationPrefGroupId = 'tasks' | 'projects' | 'activity' | 'forms' | 'care';

export type NotificationTypeDefinition = {
  label: string;
  group: NotificationPrefGroupId;
  /** User sees this row only when they have any level in at least one of these areas (and module on). */
  areas: readonly PermissionArea[];
};

const TASK: NotificationTypeDefinition['areas'] = ['tasks'];
const PROJECT: NotificationTypeDefinition['areas'] = ['tasks'];
const ACTIVITY: NotificationTypeDefinition['areas'] = ['inbox', 'clients', 'pipeline', 'contacts'];
const FORMS_CRM: NotificationTypeDefinition['areas'] = ['clients', 'forms'];
const CARE: NotificationTypeDefinition['areas'] = ['care', 'schedule'];

/** Canonical labels and My Account grouping for each notification type. */
export const NOTIFICATION_TYPE_REGISTRY: Record<NotificationType, NotificationTypeDefinition> = {
  task_assigned: { label: 'A task is assigned to me', group: 'tasks', areas: TASK },
  task_unassigned: { label: "I'm unassigned from a task", group: 'tasks', areas: TASK },
  task_mention: { label: 'Someone @mentions me on a task', group: 'tasks', areas: TASK },
  task_comment: { label: 'Comments on tasks I follow', group: 'tasks', areas: TASK },
  task_attachment: { label: 'Files attached to tasks I follow', group: 'tasks', areas: TASK },
  task_due_date_changed: { label: 'Due dates change on tasks I follow', group: 'tasks', areas: TASK },
  task_moved: { label: 'Tasks I follow are moved', group: 'tasks', areas: TASK },
  task_subtask_added: { label: 'Subtasks are added to tasks I follow', group: 'tasks', areas: TASK },
  task_completed: { label: 'Tasks I follow are completed', group: 'tasks', areas: TASK },
  task_form_submission: { label: 'A task form I own gets a submission', group: 'tasks', areas: TASK },
  project_added: { label: "I'm added to a project", group: 'projects', areas: PROJECT },
  project_removed: { label: "I'm removed from a project", group: 'projects', areas: PROJECT },
  activity_forwarded: { label: 'Someone forwards activity to me', group: 'activity', areas: ACTIVITY },
  activity_mention: { label: 'Someone @mentions me in activity', group: 'activity', areas: ACTIVITY },
  form_submission: { label: 'A form in Forms gets a submission', group: 'forms', areas: ['forms'] },
  client_form_submitted: { label: 'A client form I can edit is submitted', group: 'forms', areas: FORMS_CRM },
  form_attached: { label: 'A form is added to a client assigned to me', group: 'forms', areas: FORMS_CRM },
  care_form_submission: { label: 'A care form gets a submission', group: 'care', areas: CARE },
  care_shift_assigned: { label: 'A shift is assigned to me', group: 'care', areas: CARE },
};

export const NOTIFICATION_PREF_GROUP_LABELS: Record<NotificationPrefGroupId, string> = {
  tasks: 'Tasks',
  projects: 'Projects',
  activity: 'Activity',
  forms: 'Forms',
  care: 'Care',
};

/** Defaults when the user has not saved a choice (stored JSON only holds overrides). */
export function defaultChannelSettings(type: NotificationType): NotificationChannelSettings {
  return {
    inApp: true,
    email: !EMAIL_OFF_BY_DEFAULT.includes(type),
    push: false,
  };
}

export function notificationTypeEligible(
  user: Pick<MeDto, 'role' | 'permissions' | 'modules'> | null | undefined,
  type: NotificationType,
): boolean {
  const def = NOTIFICATION_TYPE_REGISTRY[type];
  return def.areas.some((area) => areaLevel(user, area) !== null);
}

export type NotificationPrefRow = { key: NotificationType; label: string };
export type NotificationPrefGroup = { id: NotificationPrefGroupId; label: string; rows: NotificationPrefRow[] };

/** Groups for My Account, omitting types the role can never receive. */
export function notificationPrefGroups(
  me: Pick<MeDto, 'role' | 'permissions' | 'modules'> | null | undefined,
): NotificationPrefGroup[] {
  const byGroup = new Map<NotificationPrefGroupId, NotificationPrefRow[]>();
  for (const type of NOTIFICATION_TYPES) {
    if (!notificationTypeEligible(me, type)) continue;
    const def = NOTIFICATION_TYPE_REGISTRY[type];
    const rows = byGroup.get(def.group) ?? [];
    rows.push({ key: type, label: def.label });
    byGroup.set(def.group, rows);
  }
  const order: NotificationPrefGroupId[] = ['tasks', 'projects', 'activity', 'forms', 'care'];
  return order
    .filter((id) => (byGroup.get(id)?.length ?? 0) > 0)
    .map((id) => ({ id, label: NOTIFICATION_PREF_GROUP_LABELS[id], rows: byGroup.get(id)! }));
}

export type StoredChannelOverrides = Partial<Record<NotificationType, Partial<NotificationChannelSettings>>>;

export type ChannelPreferences = Record<NotificationType, NotificationChannelSettings>;

export function resolveChannelPreferences(
  stored: {
    inApp?: Partial<Record<NotificationType, boolean>> | null;
    email?: Partial<Record<NotificationType, boolean>> | null;
    push?: Partial<Record<NotificationType, boolean>> | null;
  },
): ChannelPreferences {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => {
      const defaults = defaultChannelSettings(type);
      return [
        type,
        {
          inApp: typeof stored.inApp?.[type] === 'boolean' ? stored.inApp[type]! : defaults.inApp,
          email: typeof stored.email?.[type] === 'boolean' ? stored.email[type]! : defaults.email,
          push: typeof stored.push?.[type] === 'boolean' ? stored.push[type]! : defaults.push,
        },
      ] as const;
    }),
  ) as ChannelPreferences;
}

export function channelEnabled(prefs: ChannelPreferences, type: NotificationType, channel: NotificationChannel): boolean {
  return prefs[type][channel];
}
