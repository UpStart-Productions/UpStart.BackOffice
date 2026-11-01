import type { FormSectionDto } from './forms';

/** Care module: who is in care, visits (with the visit checklist from Forms) and the schedule. */

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
  /** The visit checklist form in Forms (null when none is set). */
  formId: string | null;
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

/** The client page's Care tab: status and whether the user may change it. */
export type CareClientOverviewDto = {
  clientId: string;
  careStatus: CareStatus | null;
  /** Care → Setup: add to care and change the status. */
  canManage: boolean;
};

// ── Reports ──────────────────────────────────────────────────────────────────

/** Reports → Scheduled vs actual: one worker at one client in the period. */
export type CareScheduledVsActualRowDto = {
  workerId: string;
  workerName: string;
  clientId: string;
  clientName: string;
  /** Minutes of scheduled (not cancelled) shifts. */
  scheduledMin: number;
  /** Minutes of finished visits. */
  visitedMin: number;
  shiftCount: number;
  /** Shifts that already ended with no visit. */
  missedShifts: number;
  /** Finished visits that weren't on a shift. */
  unscheduledVisits: number;
};
