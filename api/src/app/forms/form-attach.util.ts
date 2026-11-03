import type { Prisma } from '@prisma/client';
import { normalizeFormSettings, type FormAttachInfoDto, type FormAttachTargetDto, type FormAttachVisibilityDto } from '@upstart/back-office/shared';
import { normalizeEmail } from '../communications/email-address.util';
import type { PrismaService } from '../prisma/prisma.service';
import { sanitizeFormAccess } from './form-access.util';

type Db = PrismaService | Prisma.TransactionClient;

const TARGET_SELECT = {
  id: true,
  name: true,
  journey: true,
  tags: { select: { tag: { select: { name: true } } } },
  contactLinks: { select: { contact: { select: { firstName: true, lastName: true } } }, take: 6 },
} as const;

type TargetRow = Prisma.ClientGetPayload<{ select: typeof TARGET_SELECT }>;

function target(c: TargetRow): FormAttachTargetDto {
  return {
    clientId: c.id,
    name: c.name,
    journey: c.journey,
    tags: c.tags.map((t) => t.tag.name),
    people: c.contactLinks.map((l) => [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' ')).filter(Boolean),
  };
}

/** Every client and organization the user reaches, for the attach picker (with status, tags and people). */
export async function attachTargets(db: Db, reach: string[] | null): Promise<FormAttachTargetDto[]> {
  const rows = await db.client.findMany({
    where: reach === null ? {} : { id: { in: reach } },
    select: TARGET_SELECT,
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => target(r));
}

/** Who will see a response of this form once attached (for the confirmation step). */
export async function attachVisibility(db: Db, form: { access: unknown; settings: unknown }): Promise<FormAttachVisibilityDto> {
  const isClientForm = normalizeFormSettings(form.settings).client.enabled;
  const roles = await db.role.findMany({ select: { id: true, name: true, permissions: true }, orderBy: { name: 'asc' } });
  let list: FormAttachVisibilityDto['roles'];
  if (isClientForm) {
    const access = sanitizeFormAccess(form.access);
    list = roles.filter((r) => access[r.id]).map((r) => ({ name: r.name, level: access[r.id] }));
  } else {
    list = roles
      .filter((r) => !!(r.permissions as Record<string, unknown> | null)?.['forms'])
      .map((r) => ({ name: r.name, level: 'read' as const }));
  }
  const anyLimited = roles.some((r) => (r.permissions as Record<string, unknown> | null)?.['clients'] !== 'all');
  return { roles: list, limitedToAssigned: anyLimited, isClientForm };
}

export async function attachInfo(db: Db, form: { access: unknown; settings: unknown }): Promise<FormAttachInfoDto> {
  return { visibility: await attachVisibility(db, form) };
}

/** A note on the record's Activity: a form response was attached to it or moved off it. */
export async function logFormActivity(db: Db, user: { id: string; email: string }, clientId: string, subject: string) {
  await db.interaction.create({
    data: {
      type: 'NOTE',
      direction: 'INTERNAL',
      occurredAt: new Date(),
      subject: subject.slice(0, 300),
      source: 'MANUAL',
      status: 'FILED',
      clientId,
      loggedByUserId: user.id,
      participants: { create: [{ email: user.email.toLowerCase(), role: 'ATTENDEE', userId: user.id }] },
    },
  });
}
