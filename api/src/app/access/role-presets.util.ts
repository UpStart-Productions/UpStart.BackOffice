import type { Prisma } from '@prisma/client';
import { ROLE_PRESETS } from '@upstart/back-office/shared';

type RoleDb = Pick<Prisma.TransactionClient, 'role'>;

export { presetFor } from '@upstart/back-office/shared';

/**
 * Make sure the current tenant has the built-in Member and Guest roles, with exactly the access defined in
 * libs/shared permissions.ts (stored JSON is overwritten, so it can't drift; queries like usersWithArea read it).
 * A role with the same name but no key is adopted. Run inside a tenant context.
 */
export async function ensurePresetRoles(db: RoleDb): Promise<void> {
  for (const p of ROLE_PRESETS) {
    const data = { name: p.name, permissions: p.permissions, actions: p.actions };
    const byKey = await db.role.findFirst({ where: { key: p.key }, select: { id: true } });
    if (byKey) {
      await db.role.update({ where: { id: byKey.id }, data });
      continue;
    }
    const byName = await db.role.findFirst({ where: { name: p.name }, select: { id: true } });
    if (byName) await db.role.update({ where: { id: byName.id }, data: { ...data, key: p.key } });
    else await db.role.create({ data: { ...data, key: p.key } });
  }
}
