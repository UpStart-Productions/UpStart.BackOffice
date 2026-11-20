/**
 * Schedule (core): visits to clients by team members, with tenant-defined visit types. Forms attached to a visit
 * type are filled in on each of its visits; those submissions land on the client's Records tab.
 */

export type VisitStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type VisitPersonRef = { id: string; name: string; avatarUrl: string | null };

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Visit types (Settings → Pick lists) ──────────────────────────────────────

/** A visit type as Settings and pickers see it. Hidden (isActive false) types keep their visits but can't be picked. */
export type VisitTypeDto = {
  id: string;
  name: string;
  isActive: boolean;
  /** Visits of this type (a type with visits can be hidden, not deleted). */
  visitCount: number;
};

// ── Visits ───────────────────────────────────────────────────────────────────

export type VisitDto = {
  id: string;
  clientId: string;
  clientName: string;
  /** Null: an open visit nobody has yet. */
  teamMember: VisitPersonRef | null;
  visitType: { id: string; name: string };
  /** Planned start and end. */
  startAt: string;
  endAt: string;
  status: VisitStatus;
  notes: string | null;
  seriesId: string | null;
  /** Repeat rule of the series, e.g. "Every Mon, Wed, Fri". */
  repeatLabel: string | null;
  /** Actual start and end, once the visit is started and finished. */
  startedAt: string | null;
  endedAt: string | null;
  /** Actual minutes (finished visits). */
  durationMin: number | null;
};

/** A form to fill in on a visit (attached to its visit type) and the submission made on this visit, if any. */
export type VisitFormDto = {
  formId: string;
  formName: string;
  recordId: string | null;
  /** Null: not submitted yet (or not started). */
  submittedAt: string | null;
};

export type VisitDetailDto = VisitDto & {
  forms: VisitFormDto[];
  timeEntryId: string | null;
  /** The time entry is on an invoice: actual times can't change and the visit can't be deleted. */
  invoiced: boolean;
  /** Can change the visit (plan, notes, actual times). */
  canEdit: boolean;
  /** Can start and finish it and fill in its forms: the team member on it, or someone who sees everyone's visits. */
  canWork: boolean;
};

// ── Reports ──────────────────────────────────────────────────────────────────

/** Reports → Scheduled vs actual: one team member at one client in the period. */
export type VisitScheduledVsActualRowDto = {
  teamMemberId: string;
  teamMemberName: string;
  clientId: string;
  clientName: string;
  /** Minutes of planned (not cancelled) visits. */
  scheduledMin: number;
  /** Minutes actually worked (finished visits). */
  visitedMin: number;
  visitCount: number;
  /** Visits that already ended with no start. */
  missedVisits: number;
};
