import type { FormAccess } from '@upstart/back-office/shared';

/** Keep only roleId -> "read" pairs. Members and Guests only ever view client-form submissions; "edit" (older forms) reads as "read". Admins always edit. */
export function sanitizeFormAccess(input: unknown): FormAccess {
  const out: FormAccess = {};
  if (!input || typeof input !== 'object') return out;
  for (const [roleId, level] of Object.entries(input as Record<string, unknown>)) {
    if (level === 'read' || level === 'edit') out[roleId] = 'read';
  }
  return out;
}
