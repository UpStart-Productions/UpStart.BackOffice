import type { Prisma } from '@prisma/client';
import {
  FREE_FORM_MODULE, normalizeFormSettings, type FormScoreBand, type FormScores, type FormSnapshot, type FormSubmissionListItemDto,
} from '@upstart/back-office/shared';
import type { FormStructureService } from './form-structure.service';

export const M = FREE_FORM_MODULE;

/** The live form as Publish would freeze it. */
export async function liveSnapshot(
  structure: FormStructureService,
  form: { id: string; name: string; description: string | null; settings: unknown },
): Promise<FormSnapshot> {
  return {
    name: form.name,
    description: form.description,
    sections: await structure.sections(form.id),
    scoring: normalizeFormSettings(form.settings).scoring,
  };
}

/**
 * JSON with object keys sorted, and undefined and null dropped (Postgres jsonb doesn't keep key order; a key that's
 * null now and missing in an older snapshot, like a new section intro, isn't a change).
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/** Whether the live form differs from its published version. */
export function snapshotsDiffer(live: FormSnapshot, published: unknown): boolean {
  return canonical(live) !== canonical(published ?? null);
}

export function personName(u: { firstName: string | null; lastName: string | null; name: string | null; email: string } | null): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
}

export const SUBMISSION_INCLUDE = {
  client: { select: { name: true } },
  version: { select: { number: true, snapshot: true } },
} as const;

export type SubmissionRow = Prisma.FormResponseGetPayload<{ include: typeof SUBMISSION_INCLUDE }>;

export function bandsOf(row: { version: { snapshot: unknown } | null }): FormScoreBand[] {
  return ((row.version?.snapshot as FormSnapshot | undefined)?.scoring?.bands ?? []) as FormScoreBand[];
}

export function submissionItem(r: SubmissionRow): FormSubmissionListItemDto {
  const scores = r.scores as unknown as FormScores | null;
  const band = scores?.bandId ? bandsOf(r).find((b) => b.id === scores.bandId) : null;
  return {
    id: r.id,
    formId: r.formId,
    status: r.status,
    submitterName: r.submitterName,
    submitterEmail: r.submitterEmail,
    submitterOrganization: r.submitterOrganization,
    percent: scores ? scores.percent : null,
    bandLabel: band?.label ?? null,
    clientId: r.clientId,
    clientName: r.client?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}
