import { randomUUID } from 'crypto';
import { FieldOption, FieldType } from './task-fields.util';

export type FormQuestionType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'EMAIL'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'CHECKBOX'
  | 'FILE';

/** Where an answer goes on the created task. */
export type FormQuestionTarget = 'NAME' | 'DESCRIPTION' | 'FIELD';

export type FormQuestion = {
  id: string;
  /** Machine name used by API callers and URL prefill (?key=value). */
  key: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  helpText?: string;
  /** SELECT / MULTI_SELECT choices (labels). For FIELD targets these come from the custom field. */
  options?: string[];
  target: FormQuestionTarget;
  fieldId?: string;
  /** Not shown on the form; filled from the URL or by an API caller. */
  hidden?: boolean;
};

export const QUESTION_TYPES: FormQuestionType[] = [
  'SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'EMAIL', 'SELECT', 'MULTI_SELECT', 'CHECKBOX', 'FILE',
];

type FieldDef = { id: string; name: string; type: string; options: FieldOption[] };

const FIELD_TO_QUESTION: Record<FieldType, FormQuestionType> = {
  TEXT: 'SHORT_TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  SINGLE_SELECT: 'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  CHECKBOX: 'CHECKBOX',
};

export function slugify(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'form'
  );
}

const keyify = (text: string) => slugify(text, 40).replace(/-/g, '_');

/** Default questions for a new form. */
export function defaultQuestions(): FormQuestion[] {
  return [
    { id: randomUUID(), key: 'title', label: 'Title', type: 'SHORT_TEXT', required: true, target: 'NAME' },
    { id: randomUUID(), key: 'details', label: 'Details', type: 'LONG_TEXT', required: false, target: 'DESCRIPTION' },
  ];
}

/**
 * Clean up questions from the builder: ids, unique keys, exactly one NAME (short text) question,
 * FIELD questions typed from their custom field. Throws Error with a user-facing message.
 */
export function normalizeQuestions(input: unknown, fields: FieldDef[]): FormQuestion[] {
  if (!Array.isArray(input)) throw new Error('questions must be a list');
  const out: FormQuestion[] = [];
  const keys = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r['label'] === 'string' ? r['label'].trim().slice(0, 300) : '';
    if (!label) throw new Error('Every question needs a label');
    let target: FormQuestionTarget = r['target'] === 'NAME' || r['target'] === 'FIELD' ? (r['target'] as FormQuestionTarget) : 'DESCRIPTION';
    let type = QUESTION_TYPES.includes(r['type'] as FormQuestionType) ? (r['type'] as FormQuestionType) : 'SHORT_TEXT';
    let options: string[] | undefined;
    let fieldId: string | undefined;
    if (target === 'FIELD') {
      const field = fields.find((f) => f.id === r['fieldId']);
      if (!field) throw new Error(`“${label}” maps to a custom field that no longer exists`);
      fieldId = field.id;
      type = FIELD_TO_QUESTION[field.type as FieldType] ?? 'SHORT_TEXT';
      options = field.options.map((o) => o.label);
    } else if (type === 'SELECT' || type === 'MULTI_SELECT') {
      options = (Array.isArray(r['options']) ? r['options'] : [])
        .filter((o): o is string => typeof o === 'string' && !!o.trim())
        .map((o) => o.trim().slice(0, 200));
      options = [...new Set(options)];
      if (!options.length) throw new Error(`“${label}” needs at least one choice`);
    }
    if (target === 'NAME') type = 'SHORT_TEXT';
    if (type === 'FILE') target = 'DESCRIPTION';
    let key = keyify(typeof r['key'] === 'string' && r['key'].trim() ? r['key'] : label);
    const base = key;
    for (let i = 2; keys.has(key); i++) key = `${base}_${i}`;
    keys.add(key);
    out.push({
      id: typeof r['id'] === 'string' && r['id'] ? r['id'] : randomUUID(),
      key,
      label,
      type,
      required: r['required'] === true,
      ...(typeof r['helpText'] === 'string' && r['helpText'].trim() ? { helpText: r['helpText'].trim().slice(0, 1000) } : {}),
      ...(options ? { options } : {}),
      target,
      ...(fieldId ? { fieldId } : {}),
      ...(r['hidden'] === true && type !== 'FILE' ? { hidden: true } : {}),
    });
  }
  const names = out.filter((q) => q.target === 'NAME');
  if (names.length !== 1) throw new Error('A form needs exactly one question that becomes the task name');
  return out;
}

export type FormSubmission = {
  name: string;
  descriptionHtml: string;
  fieldValues: { fieldId: string; value: unknown }[];
  /** Questions whose answers we kept, for the confirmation email. */
  answered: { label: string; text: string }[];
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function answerFor(q: FormQuestion, answers: Record<string, unknown>): unknown {
  if (q.id in answers) return answers[q.id];
  return answers[q.key];
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
}

function pickOption(q: FormQuestion, value: unknown): string {
  const text = String(value).trim().toLowerCase();
  const match = (q.options ?? []).find((o) => o.toLowerCase() === text);
  if (!match) throw new Error(`“${q.label}”: “${String(value)}” isn't one of the choices`);
  return match;
}

/**
 * Validate answers against the questions and build the task: name, description HTML, custom field
 * values. `fileCount` satisfies required FILE questions. Throws Error listing what's wrong.
 */
export function buildSubmission(
  questions: FormQuestion[],
  answersIn: Record<string, unknown>,
  fields: FieldDef[],
  opts: { fileCount?: number; formName: string; submitter?: { name?: string | null; email?: string | null }; context?: Record<string, unknown> | null },
): FormSubmission {
  const problems: string[] = [];
  let name = '';
  const parts: string[] = [];
  const fieldValues: { fieldId: string; value: unknown }[] = [];
  const answered: { label: string; text: string }[] = [];

  for (const q of questions) {
    const raw = answerFor(q, answersIn);
    if (q.type === 'FILE') {
      if (q.required && !opts.fileCount) problems.push(`“${q.label}” needs a file`);
      continue;
    }
    if (isEmpty(raw) || (q.type === 'CHECKBOX' && raw === false && q.required)) {
      if (q.required) problems.push(`“${q.label}” is required`);
      continue;
    }
    try {
      let text: string;
      let fieldValue: unknown;
      switch (q.type) {
        case 'SHORT_TEXT':
        case 'LONG_TEXT':
          if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error(`“${q.label}” should be text`);
          text = String(raw).trim().slice(0, q.type === 'SHORT_TEXT' ? 500 : 10000);
          fieldValue = text.slice(0, 5000);
          break;
        case 'EMAIL':
          text = String(raw).trim().slice(0, 254);
          if (!isValidEmail(text)) throw new Error(`“${q.label}” should be an email address`);
          fieldValue = text;
          break;
        case 'NUMBER': {
          const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
          if (!Number.isFinite(n)) throw new Error(`“${q.label}” should be a number`);
          text = String(n);
          fieldValue = n;
          break;
        }
        case 'DATE':
          text = String(raw).trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) || Number.isNaN(Date.parse(text.slice(0, 10)))) {
            throw new Error(`“${q.label}” should be a date (YYYY-MM-DD)`);
          }
          text = text.slice(0, 10);
          fieldValue = text;
          break;
        case 'CHECKBOX': {
          const b = raw === true || raw === 'true' || raw === 'on' || raw === 'yes' || raw === 1;
          text = b ? 'Yes' : 'No';
          fieldValue = b;
          break;
        }
        case 'SELECT':
          text = pickOption(q, raw);
          fieldValue = text;
          break;
        case 'MULTI_SELECT': {
          const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((v) => String(v)).filter((v) => v.trim());
          const picked = [...new Set(list.map((v) => pickOption(q, v)))];
          if (!picked.length) {
            if (q.required) problems.push(`“${q.label}” is required`);
            continue;
          }
          text = picked.join(', ');
          fieldValue = picked;
          break;
        }
      }
      answered.push({ label: q.label, text });
      if (q.target === 'NAME') {
        name = text.replace(/\s+/g, ' ').slice(0, 500);
      } else if (q.target === 'FIELD' && q.fieldId) {
        const field = fields.find((f) => f.id === q.fieldId);
        if (!field) continue;
        // Select answers are labels; custom fields store option ids.
        if (field.type === 'SINGLE_SELECT') {
          fieldValue = field.options.find((o) => o.label.toLowerCase() === String(fieldValue).toLowerCase())?.id;
        } else if (field.type === 'MULTI_SELECT') {
          fieldValue = (fieldValue as string[])
            .map((label) => field.options.find((o) => o.label.toLowerCase() === label.toLowerCase())?.id)
            .filter(Boolean);
        }
        if (fieldValue !== undefined) fieldValues.push({ fieldId: field.id, value: fieldValue });
        parts.push(`<p><strong>${escapeHtml(q.label)}</strong><br>${escapeHtml(text)}</p>`);
      } else {
        parts.push(`<p><strong>${escapeHtml(q.label)}</strong><br>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</p>`);
      }
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (problems.length) throw new Error(problems.join('; '));

  const context = opts.context && typeof opts.context === 'object' ? Object.entries(opts.context) : [];
  if (context.length) {
    const items = context
      .slice(0, 50)
      .map(([k, v]) => `<li><strong>${escapeHtml(String(k).slice(0, 100))}:</strong> ${escapeHtml((typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 2000))}</li>`)
      .join('');
    parts.push(`<p><strong>Details</strong></p><ul>${items}</ul>`);
  }
  const who = opts.submitter
    ? [opts.submitter.name?.trim(), opts.submitter.email?.trim() ? `&lt;${escapeHtml(opts.submitter.email.trim())}&gt;` : '']
        .filter(Boolean)
        .map((s, i) => (i === 0 && !s!.startsWith('&lt;') ? escapeHtml(s!) : s))
        .join(' ')
    : '';
  parts.push(`<p><em>Submitted via the “${escapeHtml(opts.formName)}” form${who ? ` by ${who}` : ''}</em></p>`);

  return { name: name || `${opts.formName} submission`, descriptionHtml: parts.join(''), fieldValues, answered };
}

/** Questions as sent to a form page / API caller (field-backed choices resolved, hidden flagged). */
export function publicQuestions(questions: FormQuestion[]) {
  return questions.map(({ fieldId: _f, target, ...q }) => ({ ...q, isTaskName: target === 'NAME' }));
}
