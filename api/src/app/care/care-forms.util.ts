import type { Prisma } from '@prisma/client';
import { CARE_FORM_DEFAULT_NAMES, CARE_FORM_KINDS, type CareFormAccess, type CareFormKind } from '@upstart/back-office/shared';

type Db = Pick<Prisma.TransactionClient, 'careForm'>;

/** Every tenant with Care gets one Intake form and one Care profile (empty; the tenant adds the fields). */
export async function ensureCareForms(db: Db): Promise<void> {
  const existing = await db.careForm.findMany({ select: { kind: true } });
  const have = new Set(existing.map((f) => f.kind as CareFormKind));
  for (const kind of CARE_FORM_KINDS) {
    if (have.has(kind)) continue;
    // Two first requests can race; the unique (tenant, kind) keeps one and the other is fine to ignore.
    await db.careForm.create({ data: { kind, name: CARE_FORM_DEFAULT_NAMES[kind] } }).catch((err: { code?: string }) => {
      if (err?.code !== 'P2002') throw err;
    });
  }
}

export function sanitizeFormAccess(input: unknown): CareFormAccess {
  const out: CareFormAccess = {};
  if (!input || typeof input !== 'object') return out;
  for (const [roleId, level] of Object.entries(input as Record<string, unknown>)) {
    if (level === 'read' || level === 'edit') out[roleId] = level;
  }
  return out;
}
