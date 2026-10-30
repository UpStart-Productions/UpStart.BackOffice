import type { FormAccess } from '@upstart/back-office/shared';

/** Keep only roleId -> "read" | "edit" pairs. */
export function sanitizeFormAccess(input: unknown): FormAccess {
  const out: FormAccess = {};
  if (!input || typeof input !== 'object') return out;
  for (const [roleId, level] of Object.entries(input as Record<string, unknown>)) {
    if (level === 'read' || level === 'edit') out[roleId] = level;
  }
  return out;
}
