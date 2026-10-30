/**
 * Form engine (core): field types, form structure, public links and builder profiles.
 * Modules that need forms (Care today, the Forms area next) use these; the engine never knows what a response is about.
 */

export type FormFieldType = 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX';
export const FORM_FIELD_TYPES: FormFieldType[] = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX'];
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  TEXT: 'Text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  SINGLE_SELECT: 'Single-select',
  MULTI_SELECT: 'Multi-select',
  CHECKBOX: 'Checkbox',
};
export function isSelectFieldType(type: FormFieldType): boolean {
  return type === 'SINGLE_SELECT' || type === 'MULTI_SELECT';
}

/** `points`: scoring only (never sent to public pages). */
export type FormFieldOption = { id: string; label: string; points?: number };
export type FormFieldDto = {
  id: string;
  name: string;
  type: FormFieldType;
  options: FormFieldOption[];
  required: boolean;
  /** Scoring: the score area this field counts toward (FormScoreGroup.id). */
  scoreGroupId?: string | null;
};
export type FormSectionDto = { id: string; name: string; fields: FormFieldDto[] };

/** Per role: what people with that role can do with a form. Admins can always edit. */
export type FormAccessLevel = 'read' | 'edit';
export type FormAccess = Record<string, FormAccessLevel>;

// ── Builder profiles ─────────────────────────────────────────────────────────

/**
 * What the builder offers for one kind of form. A hard rule: the builder shows only these, and the API
 * refuses anything else. Each module declares a profile per form it owns; free-standing forms get them all.
 */
export type FormProfile = {
  /** Field types people can add. */
  fieldTypes: FormFieldType[];
  /** "Required" on fields (only enforced on public links). */
  required: boolean;
  /** Links anyone can use to send a new response. */
  newLinks: boolean;
  /** Links for one organization's response (e.g. family updating a Care profile). */
  clientLinks: boolean;
  /** Points on select options, score areas and profile bands. */
  scoring: boolean;
};

const ALL_FIELDS: FormProfile = { fieldTypes: FORM_FIELD_TYPES, required: true, newLinks: true, clientLinks: false, scoring: true };

/** Profiles of module-owned forms, keyed "module:key". */
export const FORM_PROFILES: Record<string, FormProfile> = {
  'care:INTAKE': { fieldTypes: FORM_FIELD_TYPES, required: true, newLinks: true, clientLinks: true, scoring: false },
  'care:CARE_PROFILE': { fieldTypes: FORM_FIELD_TYPES, required: true, newLinks: false, clientLinks: true, scoring: false },
  'care:VISIT': { fieldTypes: FORM_FIELD_TYPES, required: true, newLinks: false, clientLinks: false, scoring: false },
};

/** Module of free-standing forms (the Forms area). */
export const FREE_FORM_MODULE = 'forms';

/** The profile for a form. Free-standing forms (no key) get everything the engine offers. */
export function formProfile(module: string, key: string | null | undefined): FormProfile {
  if (!key) return ALL_FIELDS;
  return FORM_PROFILES[`${module}:${key}`] ?? ALL_FIELDS;
}

// ── Public links ─────────────────────────────────────────────────────────────

export type FormLinkKind = 'NEW' | 'CLIENT';
/** How someone opening a public link proves who they are. */
export type FormLinkVerify = 'NONE' | 'PASSCODE' | 'EMAIL_CODE';
export const FORM_LINK_VERIFY_LABELS: Record<FormLinkVerify, string> = {
  NONE: 'No check',
  PASSCODE: 'Passcode',
  EMAIL_CODE: 'Emailed code',
};

export type FormLinkDto = {
  id: string;
  formId: string;
  kind: FormLinkKind;
  label: string | null;
  clientId: string | null;
  clientName: string | null;
  verify: FormLinkVerify;
  email: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  url: string;
};

/** What the public page gets before anyone has proven who they are. */
export type FormPublicLinkDto = {
  formName: string;
  description: string | null;
  organizationName: string;
  kind: FormLinkKind;
  clientName: string | null;
  verify: FormLinkVerify;
  /** EMAIL_CODE on a client link: where the code goes, partly hidden. */
  maskedEmail: string | null;
  /** Who-you-are questions to ask on new-response links (name and email are always asked). */
  ask: { organization: boolean; phone: boolean };
};

export type FormPublicSubmitResultDto = {
  ok: true;
  message: string;
  /** Scored forms: opens the results (GET /form-results/:token). */
  resultToken?: string;
};

export type FormPublicFormDto = {
  sections: FormSectionDto[];
  values: Record<string, unknown>;
  /** Email proven with a code (new response); shown read-only on the form. */
  verifiedEmail: string | null;
};

// ── Free-standing forms (Forms area): settings, scoring, versions ────────────

export type FormScoreGroup = { id: string; name: string };

/** A profile band: responses scoring up to `upTo` percent (inclusive) get it. The last band catches the rest. */
export type FormScoreBand = {
  id: string;
  label: string;
  upTo: number;
  description: string;
  nextSteps: string[];
  /** A download for this band (e.g. a PDF guide). */
  assetUrl: string | null;
  assetLabel: string | null;
};

export type FormScoring = { enabled: boolean; groups: FormScoreGroup[]; bands: FormScoreBand[] };

export type FormSettings = {
  /** Submissions wait under Waiting for review (accept into a Prospect, or dismiss). Off: they are accepted as is. */
  review: boolean;
  /** Ask the respondent for their organization (used as the Prospect name). */
  askOrganization: boolean;
  askPhone: boolean;
  /** Email the respondent their results (scored forms) or a copy of the thank-you. */
  resultsEmail: boolean;
  /** Call to action on the results page and email, e.g. Schedule a discovery chat. */
  cta: { label: string; url: string } | null;
  /** Shown after submitting. Empty: "Thanks! … was sent to …". */
  thankYou: string | null;
  scoring: FormScoring;
};

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  review: true,
  askOrganization: false,
  askPhone: false,
  resultsEmail: false,
  cta: null,
  thankYou: null,
  scoring: { enabled: false, groups: [], bands: [] },
};

/** Stored settings with defaults filled in and junk dropped. */
export function normalizeFormSettings(input: unknown): FormSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const sc = (src['scoring'] && typeof src['scoring'] === 'object' ? src['scoring'] : {}) as Record<string, any>;
  const groups: FormScoreGroup[] = (Array.isArray(sc['groups']) ? sc['groups'] : [])
    .map((g: any) => ({ id: str(g?.id, 40), name: str(g?.name, 120) }))
    .filter((g: FormScoreGroup) => g.id && g.name);
  const bands: FormScoreBand[] = (Array.isArray(sc['bands']) ? sc['bands'] : [])
    .map((b: any) => ({
      id: str(b?.id, 40),
      label: str(b?.label, 120),
      upTo: Math.max(0, Math.min(100, Number(b?.upTo) || 0)),
      description: str(b?.description),
      nextSteps: (Array.isArray(b?.nextSteps) ? b.nextSteps : []).map((x: unknown) => str(x, 400)).filter(Boolean).slice(0, 20),
      assetUrl: str(b?.assetUrl, 1000) || null,
      assetLabel: str(b?.assetLabel, 120) || null,
    }))
    .filter((b: FormScoreBand) => b.id && b.label)
    .sort((a: FormScoreBand, b: FormScoreBand) => a.upTo - b.upTo);
  const cta = src['cta'] && typeof src['cta'] === 'object' && str(src['cta'].url, 1000) ? { label: str(src['cta'].label, 120) || 'Learn more', url: str(src['cta'].url, 1000) } : null;
  return {
    review: src['review'] === undefined ? DEFAULT_FORM_SETTINGS.review : !!src['review'],
    askOrganization: !!src['askOrganization'],
    askPhone: !!src['askPhone'],
    resultsEmail: !!src['resultsEmail'],
    cta,
    thankYou: str(src['thankYou'], 2000) || null,
    scoring: { enabled: !!sc['enabled'], groups, bands },
  };
}

/** What Publish freezes and public links serve. */
export type FormSnapshot = { name: string; description: string | null; sections: FormSectionDto[]; scoring: FormScoring };

export type FormGroupScore = { id: string; name: string; score: number; max: number; percent: number };
export type FormScores = { total: number; max: number; percent: number; bandId: string | null; groups: FormGroupScore[] };

const pct = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 1000) / 10 : 0);

/**
 * Score answers: a single-select field scores its chosen option's points (max = its highest option);
 * a multi-select scores the sum of chosen options (max = the sum of positive points). Fields without
 * points don't count. The band is the first whose upTo is at or above the percentage (the last otherwise).
 */
export function computeFormScores(sections: FormSectionDto[], scoring: FormScoring, values: Record<string, unknown>): FormScores {
  const groupTotals = new Map<string, { score: number; max: number }>();
  let total = 0;
  let max = 0;
  for (const f of sections.flatMap((s) => s.fields)) {
    if (f.type !== 'SINGLE_SELECT' && f.type !== 'MULTI_SELECT') continue;
    const points = new Map(f.options.map((o) => [o.id, typeof o.points === 'number' ? o.points : null]));
    if (![...points.values()].some((p) => p !== null)) continue;
    const vals = [...points.values()].map((p) => p ?? 0);
    const fieldMax = f.type === 'SINGLE_SELECT' ? Math.max(0, ...vals) : vals.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const chosen = f.type === 'SINGLE_SELECT' ? [values[f.id]] : Array.isArray(values[f.id]) ? (values[f.id] as unknown[]) : [];
    const score = chosen.reduce<number>((sum, id) => sum + (typeof id === 'string' ? points.get(id) ?? 0 : 0), 0);
    total += score;
    max += fieldMax;
    if (f.scoreGroupId) {
      const g = groupTotals.get(f.scoreGroupId) ?? { score: 0, max: 0 };
      g.score += score;
      g.max += fieldMax;
      groupTotals.set(f.scoreGroupId, g);
    }
  }
  const percent = pct(total, max);
  const bands = [...scoring.bands].sort((a, b) => a.upTo - b.upTo);
  const band = bands.find((b) => percent <= b.upTo) ?? bands[bands.length - 1] ?? null;
  return {
    total,
    max,
    percent,
    bandId: band?.id ?? null,
    groups: scoring.groups.map((g) => {
      const t = groupTotals.get(g.id) ?? { score: 0, max: 0 };
      return { id: g.id, name: g.name, score: t.score, max: t.max, percent: pct(t.score, t.max) };
    }),
  };
}

/** Sections as public pages see them: no points or score areas. */
export function publicSections(sections: FormSectionDto[]): FormSectionDto[] {
  return sections.map((s) => ({
    ...s,
    fields: s.fields.map(({ scoreGroupId: _g, ...f }) => ({ ...f, options: f.options.map(({ id, label }) => ({ id, label })) })),
  }));
}

/** The respondent's results (public, by result token). */
export type FormResultDto = {
  formName: string;
  organizationName: string;
  firstName: string | null;
  submitterOrganization: string | null;
  submittedAt: string;
  total: number;
  max: number;
  percent: number;
  band: (Omit<FormScoreBand, 'upTo'> & { index: number }) | null;
  /** Every band in order (for a scale like Finding Your Bearings → Strong Foundation). */
  bands: { id: string; label: string }[];
  groups: FormGroupScore[];
  cta: { label: string; url: string } | null;
};

// ── Admin DTOs ───────────────────────────────────────────────────────────────

export type FormSubmissionStatus = 'PENDING' | 'ACTIVE' | 'DISMISSED';

export type FreeFormListItemDto = {
  id: string;
  name: string;
  description: string | null;
  publishedNumber: number | null;
  hasUnpublishedChanges: boolean;
  responseCount: number;
  pendingCount: number;
  updatedAt: string;
  createdByName: string | null;
};

export type FreeFormDto = {
  id: string;
  name: string;
  description: string | null;
  settings: FormSettings;
  sections: (FormSectionDto & { fields: (FormFieldDto & { valueCount?: number })[] })[];
  published: { number: number; publishedAt: string } | null;
  hasUnpublishedChanges: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type FormSubmissionListItemDto = {
  id: string;
  formId: string;
  status: FormSubmissionStatus;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterOrganization: string | null;
  percent: number | null;
  bandLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
};

export type FormSubmissionDto = FormSubmissionListItemDto & {
  formName: string;
  submitterPhone: string | null;
  versionNumber: number | null;
  sections: FormSectionDto[];
  values: Record<string, unknown>;
  scores: FormScores | null;
  bands: FormScoreBand[];
  canEdit: boolean;
};
