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

function target(c: TargetRow, reason?: string): FormAttachTargetDto {
  return {
    clientId: c.id,
    name: c.name,
    journey: c.journey,
    tags: c.tags.map((t) => t.tag.name),
    people: c.contactLinks.map((l) => [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' ')).filter(Boolean),
    ...(reason ? { reason } : {}),
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

/**
 * Suggestions for who sent a response: a person with the sender's email (their records), a record with that email,
 * or a record whose name is the sender's name. Only within the user's reach. Empty when there's nothing to go on.
 */
export async function attachMatches(db: Db, sender: { name: string | null; email: string | null }, reach: string[] | null): Promise<FormAttachTargetDto[]> {
  const inReach = (id: string) => reach === null || reach.includes(id);
  const out = new Map<string, FormAttachTargetDto>();
  const email = normalizeEmail(sender.email);
  if (email) {
    const people = await db.contactEmail.findMany({
      where: { email },
      select: { contact: { select: { firstName: true, lastName: true, accountLinks: { select: { client: { select: TARGET_SELECT } } } } } },
      take: 10,
    });
    for (const p of people) {
      const who = [p.contact.firstName, p.contact.lastName].filter(Boolean).join(' ') || email;
      for (const l of p.contact.accountLinks) if (inReach(l.client.id)) out.set(l.client.id, target(l.client, `${who} has this email`));
    }
    const byEmail = await db.client.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, select: TARGET_SELECT, take: 10 });
    for (const c of byEmail) if (inReach(c.id) && !out.has(c.id)) out.set(c.id, target(c, 'Same email'));
  }
  const name = sender.name?.trim();
  if (name && name.length >= 3) {
    const byName = await db.client.findMany({ where: { name: { contains: name, mode: 'insensitive' } }, select: TARGET_SELECT, take: 10 });
    for (const c of byName) if (inReach(c.id) && !out.has(c.id)) out.set(c.id, target(c, 'Similar name'));
    // A person with that name on a record (one name field or first + last).
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      const people = await db.contact.findMany({
        where: { firstName: { equals: parts[0], mode: 'insensitive' }, lastName: { equals: parts.slice(1).join(' '), mode: 'insensitive' } },
        select: { accountLinks: { select: { client: { select: TARGET_SELECT } } } },
        take: 10,
      });
      for (const p of people) for (const l of p.accountLinks) if (inReach(l.client.id) && !out.has(l.client.id)) out.set(l.client.id, target(l.client, `${name} is a person here`));
    }
  }
  return [...out.values()].slice(0, 10);
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

export async function attachInfo(
  db: Db,
  form: { access: unknown; settings: unknown },
  sender: { name: string | null; email: string | null },
  reach: string[] | null,
): Promise<FormAttachInfoDto> {
  return { matches: await attachMatches(db, sender, reach), visibility: await attachVisibility(db, form) };
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
