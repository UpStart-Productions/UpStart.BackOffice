import type { Prisma } from '@prisma/client';
import { CARE_FORM_DEFAULT_NAMES, CARE_FORM_KINDS, CARE_FORM_MODULE, type CareFormKind } from '@upstart/back-office/shared';

type Db = Pick<Prisma.TransactionClient, 'form'>;

/** Every tenant with Care gets its Intake form, Care profile and Visit log (empty; the tenant adds the fields). */
export async function ensureCareForms(db: Db): Promise<void> {
  const existing = await db.form.findMany({ where: { module: CARE_FORM_MODULE }, select: { key: true } });
  const have = new Set(existing.map((f) => f.key));
  for (const kind of CARE_FORM_KINDS) {
    if (have.has(kind)) continue;
    // Two first requests can race; the unique (tenant, module, key) keeps one and the other is fine to ignore.
    await db.form.create({ data: { module: CARE_FORM_MODULE, key: kind, name: CARE_FORM_DEFAULT_NAMES[kind] } }).catch((err: { code?: string }) => {
      if (err?.code !== 'P2002') throw err;
    });
  }
}

/** A Care form's kind (its key on the engine form). */
export function careKind(form: { key: string | null }): CareFormKind {
  return form.key as CareFormKind;
}

/** Where clause for one Care form by kind. */
export function careForm(kind: CareFormKind) {
  return { module: CARE_FORM_MODULE, key: kind };
}

/** Care forms in their usual order (Intake form, Care profile, Visit log). */
export function byCareKind<T extends { key: string | null }>(forms: T[]): T[] {
  const rank = (f: T) => CARE_FORM_KINDS.indexOf(f.key as CareFormKind);
  return [...forms].sort((a, b) => rank(a) - rank(b));
}
