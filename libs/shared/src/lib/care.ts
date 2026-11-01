import type { FormAccess, FormAccessLevel, FormSectionDto } from './forms';

/** Care module: tenant-defined forms (Intake form, Care profile, Visit log) on the form engine, filled in per client. */

/** VISIT is the visit log's checklist: its fields are filled in on each visit, not once per organization. */
export type CareFormKind = 'INTAKE' | 'CARE_PROFILE' | 'VISIT';
export const CARE_FORM_KINDS: CareFormKind[] = ['INTAKE', 'CARE_PROFILE', 'VISIT'];
/** Forms with one living copy per organization (not the visit checklist). */
export const CARE_RECORD_KINDS: CareFormKind[] = ['INTAKE', 'CARE_PROFILE'];
export const CARE_FORM_DEFAULT_NAMES: Record<CareFormKind, string> = {
  INTAKE: 'Intake form',
  CARE_PROFILE: 'Care profile',
  VISIT: 'Visit log',
};

/** Care's forms are engine forms with module "care" and one of these keys. */
export const CARE_FORM_MODULE = 'care';

export type CareFormDto = {
  id: string;
  kind: CareFormKind;
  name: string;
  description: string | null;
  access: FormAccess;
  sections: FormSectionDto[];
  /** What the signed-in user can do with this form. */
  myAccess: FormAccessLevel | null;
};

export type CareRecordStatus = 'PENDING' | 'ACTIVE';

export type CareRecordListItemDto = {
  id: string;
  formId: string;
  kind: CareFormKind;
  status: CareRecordStatus;
  clientId: string | null;
  clientName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  updatedAt: string;
  updatedByName: string | null;
};

export type CareRecordDto = CareRecordListItemDto & {
  formName: string;
  values: Record<string, unknown>;
  sections: FormSectionDto[];
  submitterPhone: string | null;
  publicUpdatedAt: string | null;
  publicUpdatedBy: string | null;
  myAccess: FormAccessLevel;
  attribution?: import('./types').RecordAttributionDto;
};

// ── Visits and schedule ──────────────────────────────────────────────────────

export type CareVisitStatus = 'IN_PROGRESS' | 'COMPLETED';

export type CarePersonRef = { id: string; name: string; avatarUrl: string | null };

export type CareVisitListItemDto = {
  id: string;
  clientId: string;
  clientName: string;
  worker: CarePersonRef;
  shiftId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: CareVisitStatus;
  durationMin: number | null;
};

export type CareVisitDto = CareVisitListItemDto & {
  notes: string | null;
  values: Record<string, unknown>;
  sections: FormSectionDto[];
  /** The checklist form, for Customize fields. */
  formId: string;
  timeEntryId: string | null;
  /** The time entry is on an invoice: times can't change and the visit can't be deleted. */
  invoiced: boolean;
  canEdit: boolean;
};

export type CareShiftStatus = 'SCHEDULED' | 'CANCELLED';

export type CareShiftDto = {
  id: string;
  clientId: string;
  clientName: string;
  worker: CarePersonRef | null;
  startAt: string;
  endAt: string;
  status: CareShiftStatus;
  notes: string | null;
  seriesId: string | null;
  /** Repeat rule of the series, e.g. "Every Mon, Wed, Fri". */
  repeatLabel: string | null;
  visitId: string | null;
  visitStatus: CareVisitStatus | null;
};

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Clients in care ──────────────────────────────────────────────────────────

/** Where a client is in care. A client that isn't in care has no status (null). */
export type CareStatus = 'ACTIVE' | 'PAUSED' | 'ENDED';
export const CARE_STATUSES: CareStatus[] = ['ACTIVE', 'PAUSED', 'ENDED'];
export const CARE_STATUS_LABELS: Record<CareStatus, string> = {
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  ENDED: 'Ended',
};

/** One of the client's living forms (Intake form, Care profile) and the client's copy, if started. */
export type CareClientFormDto = {
  formId: string;
  kind: CareFormKind;
  name: string;
  myAccess: FormAccessLevel;
  recordId: string | null;
  updatedAt: string | null;
};

/** The client page's Care tab: status, the forms and whether the user may change the status. */
export type CareClientOverviewDto = {
  clientId: string;
  careStatus: CareStatus | null;
  /** Only forms the user's role can open (empty without the Care forms area). */
  forms: CareClientFormDto[];
  /** Edit on the Care profile: add to care and change the status. */
  canManage: boolean;
};

/** Care → Clients: a client in care. Next shift and last visit are limited to what the user may see. */
export type CareClientListItemDto = {
  clientId: string;
  name: string;
  careStatus: CareStatus;
  hasCareProfile: boolean;
  nextShiftAt: string | null;
  nextShiftWorker: string | null;
  lastVisitAt: string | null;
};
