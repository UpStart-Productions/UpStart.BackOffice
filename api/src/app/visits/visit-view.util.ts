import { Prisma } from '@prisma/client';
import { WEEKDAY_SHORT, type VisitDto, type VisitFormDto } from '@upstart/back-office/shared';
import { toPublicAssetUrl } from '../storage/asset-url.util';

export const PERSON = { select: { id: true, firstName: true, lastName: true, name: true, email: true, avatarUrl: true } } as const;

export const VISIT_INCLUDE = {
  client: { select: { name: true } },
  user: PERSON,
  visitType: { select: { id: true, name: true } },
  series: { select: { weekdays: true } },
} as const;
export type VisitRow = Prisma.VisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

type PersonRow = { id: string; firstName: string | null; lastName: string | null; name: string | null; email: string; avatarUrl: string | null };

export function personName(u: Omit<PersonRow, 'id' | 'avatarUrl'>): string {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
}

export function personRef(u: PersonRow) {
  return { id: u.id, name: personName(u), email: u.email, avatarUrl: toPublicAssetUrl(u.avatarUrl) ?? null };
}

export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

export function repeatLabel(weekdays: number[]): string {
  const days = [...weekdays].sort((a, b) => a - b);
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Every weekday';
  return `Every ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`;
}

export function visitView(r: VisitRow): VisitDto {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    teamMember: r.user ? personRef(r.user) : null,
    visitType: { id: r.visitType.id, name: r.visitType.name },
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    status: r.status,
    notes: r.notes,
    seriesId: r.seriesId,
    repeatLabel: r.series ? repeatLabel(r.series.weekdays) : null,
    startedAt: r.startedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    durationMin: r.startedAt && r.endedAt ? minutesBetween(r.startedAt, r.endedAt) : null,
    createdByUserId: r.createdByUserId,
  };
}

/** Include for a visit's forms: those attached to its visit type, and the submissions made on it. */
export const VISIT_FORMS_INCLUDE = {
  visitType: { select: { id: true, name: true, forms: { select: { form: { select: { id: true, name: true } } } } } },
  records: { select: { id: true, formId: true, submittedAt: true, form: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
} as const;

type VisitFormsRow = {
  visitType: { forms: { form: { id: string; name: string } }[] };
  records: { id: string; formId: string; submittedAt: Date | null; form: { name: string } }[];
};

/** The visit type's forms with this visit's submission (if any), plus forms filled in here that were since detached. */
export function visitForms(v: VisitFormsRow): VisitFormDto[] {
  const forms: VisitFormDto[] = v.visitType.forms
    .map((f) => f.form)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => {
      const r = v.records.find((x) => x.formId === f.id);
      return { formId: f.id, formName: f.name, recordId: r?.id ?? null, submittedAt: r?.submittedAt?.toISOString() ?? null };
    });
  for (const r of v.records) {
    if (!forms.some((f) => f.recordId === r.id)) forms.push({ formId: r.formId, formName: r.form.name, recordId: r.id, submittedAt: r.submittedAt?.toISOString() ?? null });
  }
  return forms;
}
