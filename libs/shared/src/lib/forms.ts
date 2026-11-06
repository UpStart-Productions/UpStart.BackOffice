/**
 * Form engine (core): field types, form structure, public links and builder profiles.
 * Modules that need forms (Care today, the Forms area next) use these; the engine never knows what a response is about.
 */

/**
 * CONTENT is a text block, not a question: its `name` holds formatted text (HTML) and it never takes an answer.
 * GROUP is a repeating group: a few sub-fields filled in as rows (Add another); its answer is a list of rows.
 */
export type FormFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'CURRENCY'
  | 'PHONE'
  | 'SSN'
  | 'DATE'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'FILE'
  | 'CONTENT'
  | 'GROUP';
export const FORM_FIELD_TYPES: FormFieldType[] = ['TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PHONE', 'SSN', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX', 'FILE', 'GROUP', 'CONTENT'];
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  CONTENT: 'Text block',
  GROUP: 'Repeating group',
  FILE: 'File upload',
  TEXT: 'Text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  CURRENCY: 'Currency',
  PHONE: 'Phone',
  SSN: 'SSN',
  DATE: 'Date',
  SINGLE_SELECT: 'Single-select',
  MULTI_SELECT: 'Multi-select',
  CHECKBOX: 'Checkbox',
};
/** Lucide icon name per field type (builder rows and the type picker). */
export const FORM_FIELD_TYPE_ICONS: Record<FormFieldType, string> = {
  CONTENT: 'pilcrow',
  TEXT: 'text-cursor-input',
  LONG_TEXT: 'text-align-start',
  NUMBER: 'hash',
  CURRENCY: 'circle-dollar-sign',
  PHONE: 'phone',
  SSN: 'id-card',
  DATE: 'calendar-days',
  SINGLE_SELECT: 'circle-dot',
  MULTI_SELECT: 'list-checks',
  CHECKBOX: 'square-check-big',
  GROUP: 'rows-3',
  FILE: 'paperclip',
};

/**
 * File uploads (FILE): Word, PDF, Excel, PNG and JPG, up to 10 MB each; one file, or up to 10 when the field
 * allows several. The answer is a list of uploaded files; the files themselves are private (signed-in downloads).
 */
export const FORM_FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
export const FORM_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];
/** The file picker's accept attribute. */
export const FORM_FILE_ACCEPT = [...FORM_FILE_EXTENSIONS, ...FORM_FILE_MIME_TYPES].join(',');
export const FORM_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FORM_FILE_MAX_COUNT = 10;

/** One uploaded file in an answer. `key` is the private storage key (never a public address). */
export type FormFileRef = { key: string; name: string; size: number; type: string };

/** Whether a file name and type are allowed (by extension; the type must match when the browser sends one). */
export function isAllowedFormFile(name: string, type: string | null | undefined): boolean {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  if (!FORM_FILE_EXTENSIONS.includes(ext)) return false;
  return !type || type === 'application/octet-stream' || FORM_FILE_MIME_TYPES.includes(type);
}

/** "1.2 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What a repeating group's sub-field can be (no text blocks, groups or file uploads inside groups). */
export type FormSubfieldType = Exclude<FormFieldType, 'CONTENT' | 'GROUP' | 'FILE'>;
export const FORM_SUBFIELD_TYPES: FormSubfieldType[] = ['TEXT', 'LONG_TEXT', 'NUMBER', 'CURRENCY', 'PHONE', 'SSN', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX'];

/**
 * Phone (PHONE): US numbers, 10 digits, stored as (503) 555-1234. SSN: 9 digits, stored as 123-45-6789 and shown
 * masked (***-**-****) on screen; exports and printouts show ***-**-6789. Currency: a number with 2 decimals.
 */
export function formatPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export function formatSsnDigits(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 9);
  return d.length <= 3 ? d : d.length <= 5 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
/** An SSN with only the last 4 digits showing (***-**-6789). */
export function maskSsn(value: unknown): string {
  const d = String(value ?? '').replace(/\D/g, '');
  return d ? `***-**-${d.slice(-4)}` : '';
}
export function formatCurrency(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return String(value ?? '');
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Most sub-fields in a group, and most rows in one answer. */
export const FORM_GROUP_MAX_SUBFIELDS = 12;
export const FORM_GROUP_MAX_ROWS = 200;

/** A repeating group's answer: one object per row, sub-field id -> value. */
export type FormGroupRow = Record<string, unknown>;

/** Longest text block (HTML). Question names stay short. */
export const FORM_CONTENT_MAX = 20000;

/** A text block: shown to people, never answered, counted, scored or exported. */
export function isContentField(f: { type: FormFieldType }): boolean {
  return f.type === 'CONTENT';
}

/** Plain text as text block HTML: blank lines start paragraphs, single line breaks stay. */
export function plainTextToHtml(text: string): string {
  const esc = text.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The fields that are questions (answerable), in order. */
export function questionFields<T extends { type: FormFieldType }>(fields: T[]): T[] {
  return fields.filter((f) => !isContentField(f));
}

export function isSelectFieldType(type: FormFieldType): boolean {
  return type === 'SINGLE_SELECT' || type === 'MULTI_SELECT';
}

/** `points`: scoring only (never sent to public pages). */
export type FormFieldOption = { id: string; label: string; points?: number };
/** One column of a repeating group. Ids are kept on rename, so answers survive. */
export type FormSubfieldDto = { id: string; name: string; type: FormSubfieldType; options: FormFieldOption[] };
export type FormFieldDto = {
  id: string;
  name: string;
  type: FormFieldType;
  options: FormFieldOption[];
  required: boolean;
  /** Scoring: the score area this field counts toward (FormScoreGroup.id). */
  scoreGroupId?: string | null;
  /** Repeating groups (GROUP): the sub-fields each row has. */
  subfields?: FormSubfieldDto[];
  /** File uploads (FILE): several files (up to FORM_FILE_MAX_COUNT) instead of one. */
  multiple?: boolean;
};

/** A sub-field as a field (to fill in with the same control). */
export function subfieldAsField(sf: FormSubfieldDto): FormFieldDto {
  return { id: sf.id, name: sf.name, type: sf.type, options: sf.options, required: false };
}
/** `description`: optional intro shown under the section title. */
export type FormSectionDto = { id: string; name: string; description?: string | null; fields: FormFieldDto[] };

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

/** Forms in Forms. Client links are only offered for living client forms (the client-forms API checks that). */
const ALL_FIELDS: FormProfile = { fieldTypes: FORM_FIELD_TYPES, required: true, newLinks: true, clientLinks: true, scoring: true };

/** Profiles of module-owned forms, keyed "module:key". */
export const FORM_PROFILES: Record<string, FormProfile> = {};

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
  /** Websites that may show the form (embed script or a site's own code). Empty = any website. */
  allowedOrigins: string[];
};

/**
 * Website origins from what people type: "example.org", "https://www.example.org/page" → "https://www.example.org".
 * Bare hosts get https:// (http:// for localhost). Invalid entries are dropped; duplicates removed.
 */
export function normalizeOrigins(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,]+/) : [];
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    let text = item.trim();
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = (/^(localhost|127\.0\.0\.1)(:|$)/i.test(text) ? 'http://' : 'https://') + text;
    try {
      const u = new URL(text);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.add(u.origin.toLowerCase());
    } catch {
      // not a website address
    }
  }
  return [...out].slice(0, 50);
}

/** What the public page gets before anyone has proven who they are. */
export type FormPublicLinkDto = {
  formName: string;
  /** Plain text (for embeds). */
  description: string | null;
  /** The description as formatted HTML when it was written in the editor (Care forms); UBO's own page shows this. */
  descriptionHtml: string | null;
  organizationName: string;
  kind: FormLinkKind;
  clientName: string | null;
  verify: FormLinkVerify;
  /** EMAIL_CODE on a client link: where the code goes, partly hidden. */
  maskedEmail: string | null;
  /** Who-you-are questions to ask on new-response links (name and email are always asked). */
  ask: { organization: boolean; phone: boolean };
  /** UBO's own page for this link (embeds send people there when the link needs a passcode or emailed code). */
  pageUrl: string;
};

export type FormPublicSubmitResultDto = {
  ok: true;
  message: string;
  /** Scored forms: opens the results (GET /form-results/:token). */
  resultToken?: string;
  /** The saved response (new-response links). Not a secret: reading it needs a service key (GET /service/form-responses/:id). */
  responseId?: string;
};

/** One answer, ready to show (GET /service/form-responses/:id). */
export type FormResponseAnswerDto = { fieldId: string; section: string; label: string; value: string };

/** A response for a service (e.g. the website's email sender), read with a service key. */
export type FormServiceResponseDto = {
  id: string;
  formId: string;
  formName: string;
  organizationName: string;
  submittedAt: string;
  submitter: { name: string; firstName: string; email: string; phone: string; organization: string };
  /** Every answer in form order (text blocks, files and sensitive numbers left out). */
  answers: FormResponseAnswerDto[];
  /** Scored forms; null otherwise. */
  score: number | null;
  profile: { label: string; description: string; nextSteps: string[]; assetUrl: string; assetLabel: string } | null;
  groups: { name: string; percent: number }[];
  /** For a results page link (scored forms); empty otherwise. */
  resultToken: string;
  thankYouHtml: string;
};

export type FormPublicFormDto = {
  /** How the sections are shown (FormSettings.layout). */
  layout: FormLayout;
  sections: FormSectionDto[];
  values: Record<string, unknown>;
  /** Email proven with a code (new response); shown read-only on the form. */
  verifiedEmail: string | null;
  /** New-response links resuming a draft: who they said they are so far. */
  submitter?: { name: string | null; email: string | null; phone: string | null; organization: string | null } | null;
  /** Client links: the result was already submitted (it can still be updated). */
  submittedAt?: string | null;
};

/**
 * Auto-save on a public link (POST /form-links/:token/draft). New-response links start a draft on the first answer
 * and get a token to keep saving it (kept in the browser); client links save into their result.
 */
export type FormPublicDraftDto = { draftToken: string | null; savedAt: string };

/** Staff preview of a Forms draft (current fields and settings, not the published version). */
export type FormStaffPreviewDto = {
  formName: string;
  description: string | null;
  descriptionHtml: string | null;
  layout: FormLayout;
  sections: FormSectionDto[];
  ask: { organization: boolean; phone: boolean };
};

// ── Free-standing forms (Forms area): settings, scoring, versions ────────────

export type FormScoreGroup = { id: string; name: string };

/** Optional resource on a profile: an external link or an uploaded file (stored under `/api/uploads/…`). */
export type FormScoreBandAssetKind = 'link' | 'file';

/** A profile band: responses scoring up to `upTo` percent (inclusive) get it. The last band catches the rest. */
export type FormScoreBand = {
  id: string;
  label: string;
  upTo: number;
  description: string;
  nextSteps: string[];
  /** Link or uploaded file; omitted on older forms (treated as link when `assetUrl` is set). */
  assetKind?: FormScoreBandAssetKind | null;
  /** Link URL, or the uploaded file's public API path. */
  assetUrl: string | null;
  assetLabel: string | null;
  /** Original uploaded file name (file resources); used when Label is empty or for downloads. */
  assetFileName?: string | null;
};

/** Display / download name for a profile resource file (not external links). */
export function scoreBandResourceFileName(b: Pick<FormScoreBand, 'assetFileName' | 'assetLabel'>): string {
  return b.assetFileName?.trim() || b.assetLabel?.trim() || 'Download';
}

export type FormScoring = { enabled: boolean; groups: FormScoreGroup[]; bands: FormScoreBand[] };

/**
 * How a form is shown on public pages: all on one page, one section per screen with Next and Back ('steps',
 * shown as Page by section), one question or text block per screen ('questions'), collapsible sections
 * (accordion), or a section switcher (tabs).
 */
export type FormLayout = 'page' | 'steps' | 'questions' | 'accordion' | 'tabs';
export const FORM_LAYOUTS: FormLayout[] = ['page', 'steps', 'questions', 'accordion', 'tabs'];
export const FORM_LAYOUT_LABELS: Record<FormLayout, string> = {
  page: 'One page',
  steps: 'Page by section',
  questions: 'Page by question',
  accordion: 'Accordion',
  tabs: 'Tabs',
};

/** Client forms: answers (results) belong to a client and show on the client's page. */
export type FormClientSettings = {
  /** Answers attach to a client. */
  enabled: boolean;
  /** living: one copy per client, kept up to date (like a profile). each: a new dated result each time (like an intake). */
  copies: 'living' | 'each';
};

export type FormClientCopies = FormClientSettings['copies'];
export const FORM_CLIENT_COPIES_LABELS: Record<FormClientCopies, string> = {
  living: 'One living copy',
  each: 'New each time',
};

export const DEFAULT_FORM_CLIENT_SETTINGS: FormClientSettings = { enabled: false, copies: 'each' };

export type FormSettings = {
  /** How sections are shown on public pages. */
  layout: FormLayout;
  /** Client forms (see FormClientSettings). */
  client: FormClientSettings;
  /** Care: this form is the checklist filled in on every visit (one form per tenant; the newest wins). */
  visitChecklist: boolean;
  /** Submissions wait under Waiting for review (accept into a Prospect, or dismiss). Off: they are accepted as is. */
  review: boolean;
  /** What the form is for, in the tenant's words (the Forms list's Used for column). Optional. */
  usedFor: string | null;
  /** Email the respondent their results (scored forms) or a copy of the thank-you. */
  resultsEmail: boolean;
  /** Shown after submitting and in the results email: formatted text (HTML, cleaned). Empty: "Thanks! … was sent to …". */
  thankYou: string | null;
  scoring: FormScoring;
};

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  layout: 'page',
  client: DEFAULT_FORM_CLIENT_SETTINGS,
  visitChecklist: false,
  review: true,
  usedFor: null,
  resultsEmail: false,
  thankYou: null,
  scoring: { enabled: false, groups: [], bands: [] },
};

const SAFE_HTML_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote']);

/**
 * Formatted text (Quill) cleaned for pages and emails: only simple tags, no attributes except a link's
 * http(s)/mailto/tel address. Scripts and styles are dropped with their content.
 */
export function cleanFormHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name: string, attrs: string) => {
      const t = name.toLowerCase();
      if (!SAFE_HTML_TAGS.has(t)) return '';
      if (tag.startsWith('</')) return `</${t}>`;
      if (t === 'a') {
        const m = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
        const href = (m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim();
        return /^(https?:|mailto:|tel:)/i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">` : '<a>';
      }
      return `<${t}>`;
    });
}

/** Whether formatted text has any words in it. */
export function htmlHasText(html: string | null | undefined): boolean {
  return !!(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** The thank-you as clean HTML (older plain-text messages become paragraphs). */
function thankYouHtml(v: unknown): string | null {
  if (typeof v !== 'string' || !htmlHasText(v)) return null;
  const html = /<[a-z][^>]*>/i.test(v) ? cleanFormHtml(v.trim()) : plainTextToHtml(v);
  return html.slice(0, 8000) || null;
}

/** Stored settings with defaults filled in and junk dropped. */
export function normalizeFormSettings(input: unknown): FormSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const sc = (src['scoring'] && typeof src['scoring'] === 'object' ? src['scoring'] : {}) as Record<string, any>;
  const groups: FormScoreGroup[] = (Array.isArray(sc['groups']) ? sc['groups'] : [])
    .map((g: any) => ({ id: str(g?.id, 40), name: str(g?.name, 120) }))
    .filter((g: FormScoreGroup) => g.id && g.name);
  const bands: FormScoreBand[] = (Array.isArray(sc['bands']) ? sc['bands'] : [])
    .map((b: any) => {
      const assetUrl = str(b?.assetUrl, 1000) || null;
      const rawKind = b?.assetKind;
      const assetKind: FormScoreBandAssetKind | null =
        rawKind === 'file' || rawKind === 'link'
          ? rawKind
          : assetUrl?.startsWith('/api/uploads/')
            ? 'file'
            : assetUrl
              ? 'link'
              : null;
      return {
        id: str(b?.id, 40),
        label: str(b?.label, 120),
        upTo: Math.max(0, Math.min(100, Number(b?.upTo) || 0)),
        description: str(b?.description),
        nextSteps: (Array.isArray(b?.nextSteps) ? b.nextSteps : []).map((x: unknown) => str(x, 400)).filter(Boolean).slice(0, 20),
        assetKind,
        assetUrl,
        assetLabel: str(b?.assetLabel, 120) || null,
      };
    })
    .filter((b: FormScoreBand) => b.id && b.label)
    .sort((a: FormScoreBand, b: FormScoreBand) => a.upTo - b.upTo);
  const cl = (src['client'] && typeof src['client'] === 'object' ? src['client'] : {}) as Record<string, any>;
  const client: FormClientSettings = {
    enabled: !!cl['enabled'],
    copies: cl['copies'] === 'living' ? 'living' : 'each',
  };
  return {
    layout: FORM_LAYOUTS.includes(src['layout']) ? src['layout'] : DEFAULT_FORM_SETTINGS.layout,
    client,
    visitChecklist: !!src['visitChecklist'],
    review: src['review'] === undefined ? DEFAULT_FORM_SETTINGS.review : !!src['review'],
    // Older forms kept this as the client form's category.
    usedFor: str(src['usedFor'], 80) || str(cl['category'], 80) || null,
    resultsEmail: !!src['resultsEmail'],
    thankYou: thankYouHtml(src['thankYou']),
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

/** An answer as text: option labels for selects, Yes for a ticked checkbox, a readable date, $ amounts, SSNs masked (***-**-6789). Empty → ''. */
export function formatFormValue(field: FormFieldDto, value: unknown): string {
  if (isContentField(field) || value === null || value === undefined || value === '') return '';
  const label = (id: unknown) => field.options.find((o) => o.id === id)?.label ?? String(id);
  switch (field.type) {
    case 'SINGLE_SELECT':
      return label(value);
    case 'MULTI_SELECT':
      return Array.isArray(value) ? value.map(label).join(', ') : label(value);
    case 'CHECKBOX':
      return value === true ? 'Yes' : '';
    case 'DATE': {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
      if (!m) return String(value);
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    case 'CURRENCY':
      return formatCurrency(value);
    case 'SSN':
      return maskSsn(value);
    case 'FILE':
      return Array.isArray(value) ? (value as FormFileRef[]).map((f) => f?.name).filter(Boolean).join(', ') : '';
    case 'GROUP': {
      // One line per row: "Sub-field: value; Sub-field: value".
      const rows = Array.isArray(value) ? (value as FormGroupRow[]) : [];
      return rows
        .map((row) =>
          (field.subfields ?? [])
            .map((sf) => {
              const v = formatFormValue(subfieldAsField(sf), row?.[sf.id]);
              return v ? `${sf.name}: ${v}` : '';
            })
            .filter(Boolean)
            .join('; '),
        )
        .filter(Boolean)
        .join('\n');
    }
    default:
      return String(value);
  }
}

/** Points an answer earned, or null when the field isn't scored. */
export function formFieldPoints(field: FormFieldDto, value: unknown): number | null {
  if (!isSelectFieldType(field.type) || !field.options.some((o) => typeof o.points === 'number')) return null;
  const ids = Array.isArray(value) ? value : value == null ? [] : [value];
  return ids.reduce<number>((sum, id) => sum + (field.options.find((o) => o.id === id)?.points ?? 0), 0);
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
};

// ── Admin DTOs ───────────────────────────────────────────────────────────────

export type FormSubmissionStatus = 'PENDING' | 'ACTIVE' | 'DISMISSED';
/** Submissions list filter: a status, or IN_PROGRESS (started, not submitted yet). */
export type FormSubmissionFilter = FormSubmissionStatus | 'IN_PROGRESS';

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
  /** What the form is for (typed on the form's Settings). */
  usedFor: string | null;
  isClientForm: boolean;
  visitChecklist: boolean;
};

export type FreeFormDto = {
  id: string;
  name: string;
  description: string | null;
  settings: FormSettings;
  sections: FormSectionDto[];
  published: { number: number; publishedAt: string } | null;
  hasUnpublishedChanges: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Client forms: who can see and fill in results on client pages (roleId -> read | edit; admins always edit). */
  access: FormAccess;
  /** Someone has answered it: field types can no longer change. */
  hasAnswers: boolean;
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
  /** Null: In progress (auto-saved, not submitted yet). */
  submittedAt: string | null;
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
  /** A client form: the Attach dialog starts on Clients (others start on Organizations). */
  isClientForm: boolean;
};

/** A client or organization a response can be attached to (pickers). */
export type FormAttachTargetDto = { clientId: string; name: string; journey: 'PROSPECT' | 'CLIENT' | 'NONE'; tags: string[]; people: string[] };

/** Who will be able to see a response once it's attached (shown before confirming). */
export type FormAttachVisibilityDto = {
  /** Client forms: roles with Read or Edit (admins always). Other forms: people with the Forms area. */
  roles: { name: string; level: 'read' | 'edit' }[];
  /** People outside Organizations: All only see records assigned to them. */
  limitedToAssigned: boolean;
  isClientForm: boolean;
};

/** The Attach response dialog: suggestions and visibility. */
export type FormAttachInfoDto = { visibility: FormAttachVisibilityDto };

/** Submissions waiting for review across every form the user can see (Dashboard). */
export type PendingSubmissionDto = {
  id: string;
  formId: string;
  formName: string;
  submitterName: string | null;
  submitterEmail: string | null;
  createdAt: string;
};

// ── Client forms: results on a client's page ─────────────────────────────────

/** A client form the user can add to a client. */
export type ClientFormOptionDto = {
  formId: string;
  name: string;
  copies: FormClientCopies;
  myAccess: FormAccessLevel;
};

export type ClientFormResultListItemDto = {
  id: string;
  formId: string;
  formName: string;
  copies: FormClientCopies;
  status: 'PENDING' | 'ACTIVE' | 'DISMISSED';
  clientId: string | null;
  clientName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
  /** Null: In progress (auto-saved, not submitted yet). */
  submittedAt: string | null;
  /** False: a form that isn't a client form (e.g. an assessment accepted into an organization); opens as a submission. */
  isClientForm: boolean;
};

export type ClientFormResultDto = ClientFormResultListItemDto & {
  values: Record<string, unknown>;
  sections: FormSectionDto[];
  submitterPhone: string | null;
  publicUpdatedAt: string | null;
  publicUpdatedBy: string | null;
  myAccess: FormAccessLevel;
  /** Share links (someone outside fills in this result). */
  canShare: boolean;
  attribution?: import('./types').RecordAttributionDto;
};

/** The client page's Forms panel. */
export type ClientFormsPanelDto = {
  results: ClientFormResultListItemDto[];
  /** Forms the user can add (Edit access). */
  options: ClientFormOptionDto[];
};

// ── Form files (Export / Import) ─────────────────────────────────────────────

/** A whole free-standing form as a file: settings (scoring, profiles), sections and fields. No ids except score areas. */
export type FormDefinition = {
  format: 'ubo-form';
  version: 1;
  name: string;
  description: string | null;
  settings: FormSettings;
  sections: {
    name: string;
    description?: string | null;
    fields: {
      name: string;
      type: FormFieldType;
      required: boolean;
      /** Select fields: choices, with points on scored forms. */
      options?: { label: string; points?: number }[];
      /** Scored forms: the score area id (settings.scoring.groups[].id). */
      scoreGroupId?: string | null;
      /** Repeating groups: the sub-fields (select sub-fields have options). */
      subfields?: { name: string; type: FormSubfieldType; options?: { label: string }[] }[];
      /** File uploads: several files instead of one. */
      multiple?: boolean;
    }[];
  }[];
};

/**
 * Check a form file and return it cleaned up, or throw an Error saying what's wrong.
 * Unknown field types fail; score areas that don't exist in the file's scoring are dropped.
 */
export function parseFormDefinition(input: unknown): FormDefinition {
  const src = (input && typeof input === 'object' ? input : null) as Record<string, any> | null;
  if (!src || src['format'] !== 'ubo-form') throw new Error('This is not a UBO form file');
  if (src['version'] !== 1) throw new Error('This form file is from a newer version of UBO');
  const name = typeof src['name'] === 'string' ? src['name'].trim().slice(0, 200) : '';
  if (!name) throw new Error('The form file has no name');
  const settings = normalizeFormSettings(src['settings']);
  const groupIds = new Set(settings.scoring.groups.map((g) => g.id));
  const sections = (Array.isArray(src['sections']) ? src['sections'] : []).map((s: any, si: number) => {
    const sName = typeof s?.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 120) : `Section ${si + 1}`;
    const fields = (Array.isArray(s?.fields) ? s.fields : []).map((f: any) => {
      const fName = typeof f?.name === 'string' ? f.name.trim().slice(0, f?.type === 'CONTENT' ? FORM_CONTENT_MAX : 400) : '';
      if (!fName) throw new Error(f?.type === 'CONTENT' ? `A text block in "${sName}" is empty` : `A field in "${sName}" has no name`);
      if (!FORM_FIELD_TYPES.includes(f?.type)) throw new Error(`"${fName}" has an unknown type`);
      const type = f.type as FormFieldType;
      const options = isSelectFieldType(type)
        ? (Array.isArray(f.options) ? f.options : [])
            .filter((o: any) => typeof o?.label === 'string' && o.label.trim())
            .map((o: any) => ({ label: o.label.trim().slice(0, 400), ...(Number.isFinite(o.points) ? { points: Number(o.points) } : {}) }))
        : undefined;
      if (options && !options.length) throw new Error(`"${fName}" needs at least one choice`);
      let subfields: { name: string; type: FormSubfieldType; options?: { label: string }[] }[] | undefined;
      if (type === 'GROUP') {
        subfields = (Array.isArray(f.subfields) ? f.subfields : []).slice(0, FORM_GROUP_MAX_SUBFIELDS).map((sf: any) => {
          const sfName = typeof sf?.name === 'string' ? sf.name.trim().slice(0, 200) : '';
          if (!sfName) throw new Error(`A sub-field of "${fName}" has no name`);
          if (!FORM_SUBFIELD_TYPES.includes(sf?.type)) throw new Error(`"${sfName}" in "${fName}" has a type a repeating group can't have`);
          const sfType = sf.type as FormSubfieldType;
          const sfOptions = isSelectFieldType(sfType)
            ? (Array.isArray(sf.options) ? sf.options : []).filter((o: any) => typeof o?.label === 'string' && o.label.trim()).map((o: any) => ({ label: o.label.trim().slice(0, 400) }))
            : undefined;
          if (sfOptions && !sfOptions.length) throw new Error(`"${sfName}" in "${fName}" needs at least one choice`);
          return { name: sfName, type: sfType, ...(sfOptions ? { options: sfOptions } : {}) };
        });
        if (!subfields!.length) throw new Error(`"${fName}" needs at least one sub-field`);
      }
      return {
        name: fName,
        type,
        required: !!f.required,
        ...(options ? { options } : {}),
        ...(subfields ? { subfields } : {}),
        ...(type === 'FILE' && f.multiple ? { multiple: true } : {}),
        scoreGroupId: type !== 'GROUP' && typeof f.scoreGroupId === 'string' && groupIds.has(f.scoreGroupId) ? f.scoreGroupId : null,
      };
    });
    const description = typeof s?.description === 'string' ? s.description.trim().slice(0, 2000) || null : null;
    return { name: sName, description, fields };
  });
  if (!sections.some((s: { fields: unknown[] }) => s.fields.length)) throw new Error('The form file has no fields');
  return {
    format: 'ubo-form',
    version: 1,
    name,
    description: typeof src['description'] === 'string' ? src['description'].trim().slice(0, 4000) || null : null,
    settings,
    sections,
  };
}
