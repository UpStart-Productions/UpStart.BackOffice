import type { Prisma } from '@prisma/client';
import { ROLE_PRESETS, type RolePreset } from '@upstart/back-office/shared';

type RoleDb = Pick<Prisma.TransactionClient, 'role'>;

/**
 * Give the current tenant every preset role it doesn't have yet (matched by key, or by name for a role
 * an admin made by hand before presets existed). Existing roles are never changed. Run inside a tenant context.
 */
export async function ensurePresetRoles(db: RoleDb): Promise<void> {
  const existing = await db.role.findMany({ select: { key: true, name: true } });
  const keys = new Set(existing.map((r) => r.key).filter(Boolean));
  const names = new Set(existing.map((r) => r.name.toLowerCase()));
  for (const p of ROLE_PRESETS) {
    if (keys.has(p.key) || names.has(p.name.toLowerCase())) continue;
    await db.role.create({ data: { key: p.key, name: p.name, permissions: p.permissions, actions: p.actions } });
  }
}

export function presetFor(key: string | null | undefined): RolePreset | undefined {
  return key ? ROLE_PRESETS.find((p) => p.key === key) : undefined;
}
