import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { personName } from '../task-manager/task-people.util';
import { GUEST_ROLE } from '@upstart/back-office/shared';

export type PeopleDirectoryEntry = {
  /** Stable key for UI (deduped). */
  id: string;
  source: 'USER' | 'PROJECT_CONTACT' | 'CONTACT' | 'PIPELINE' | 'BOOKING' | 'TASK_FORM';
  sourceLabel: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  displayName: string;
  avatarUrl: string | null;
};

const SEARCH_PER_SOURCE = 12;
const BROWSE_PER_SOURCE = 120;
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 400;

function contains(q: string) {
  return { contains: q, mode: 'insensitive' as const };
}

function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const s = (full ?? '').trim();
  if (!s) return { firstName: '', lastName: '' };
  const i = s.indexOf(' ');
  if (i < 0) return { firstName: s, lastName: '' };
  return { firstName: s.slice(0, i).trim(), lastName: s.slice(i + 1).trim() };
}

function trimOrEmpty(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function entryKey(entry: Pick<PeopleDirectoryEntry, 'email' | 'firstName' | 'lastName' | 'phone'>): string {
  const email = normalizeEmail(entry.email);
  if (email) return `email:${email}`;
  const name = `${entry.firstName}|${entry.lastName}`.trim().toLowerCase();
  const phone = entry.phone.replace(/\D/g, '');
  return `name:${name}|phone:${phone}`;
}

function displayName(firstName: string, lastName: string, fallback?: string): string {
  const parts = [firstName, lastName].map((p) => p.trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  return (fallback ?? '').trim() || 'Unknown';
}

function lastNameSortKey(entry: PeopleDirectoryEntry): string {
  const last = entry.lastName.trim();
  if (last) return last.toLowerCase();
  const first = entry.firstName.trim();
  if (first) return first.toLowerCase();
  return entry.displayName.toLowerCase();
}

function sortByLastName(entries: PeopleDirectoryEntry[]): PeopleDirectoryEntry[] {
  return entries.sort((a, b) => {
    const byLast = lastNameSortKey(a).localeCompare(lastNameSortKey(b), undefined, { sensitivity: 'base' });
    if (byLast !== 0) return byLast;
    const byFirst = a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    if (byFirst !== 0) return byFirst;
    return a.email.localeCompare(b.email, undefined, { sensitivity: 'base' });
  });
}

function mergeEntries(entries: PeopleDirectoryEntry[], limit: number): PeopleDirectoryEntry[] {
  const byKey = new Map<string, PeopleDirectoryEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const score = (e: PeopleDirectoryEntry) =>
      (e.avatarUrl ? 2 : 0) +
      (e.email ? 1 : 0) +
      (e.phone ? 1 : 0) +
      (e.firstName ? 1 : 0) +
      (e.lastName ? 1 : 0);
    if (score(entry) > score(existing)) byKey.set(key, entry);
  }
  return sortByLastName([...byKey.values()]).slice(0, limit);
}

@Injectable()
export class PeopleDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    qRaw: string | undefined,
    excludeProjectId?: string,
    limit = DEFAULT_LIMIT,
    crmOnly = false,
  ): Promise<PeopleDirectoryEntry[]> {
    const q = (qRaw ?? '').trim();
    const cap = Math.min(Math.max(limit, 1), MAX_LIMIT);
    const take = q.length >= 2 ? SEARCH_PER_SOURCE : BROWSE_PER_SOURCE;
    const textFilter = q.length >= 2;

    if (crmOnly) {
      const contactWhere = textFilter
        ? {
            OR: [
              { emails: { some: { email: contains(q) } } },
              { firstName: contains(q) },
              { lastName: contains(q) },
              { phone: contains(q) },
              { accountLinks: { some: { client: { name: contains(q) } } } },
            ],
          }
        : {};
      const crmContacts = await this.prisma.contact.findMany({
        where: contactWhere,
        include: {
          emails: { select: { email: true, isPrimary: true }, orderBy: { isPrimary: 'desc' } },
          accountLinks: { select: { client: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: cap,
      });
      const entries: PeopleDirectoryEntry[] = crmContacts.map((c) => {
        const firstName = trimOrEmpty(c.firstName);
        const lastName = trimOrEmpty(c.lastName);
        const email = trimOrEmpty(c.emails[0]?.email);
        const phone = trimOrEmpty(c.phone);
        const accountName = c.accountLinks[0]?.client.name;
        return {
          id: `contact:${c.id}`,
          source: 'CONTACT' as const,
          sourceLabel: accountName ? `Contact · ${accountName}` : 'Contact',
          firstName,
          lastName,
          email,
          phone,
          displayName: displayName(firstName, lastName, email),
          avatarUrl: c.avatarUrl,
        };
      });
      return sortByLastName(entries).slice(0, cap);
    }

    const userWhere = textFilter
      ? {
          isActive: true,
          OR: [
            { email: contains(q) },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { name: contains(q) },
          ],
        }
      : { isActive: true };

    const projectContactWhere = textFilter
      ? {
          ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
          OR: [
            { email: contains(q) },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { phone: contains(q) },
          ],
        }
      : {
          ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
        };

    const contactWhere = textFilter
      ? {
          OR: [
            { emails: { some: { email: contains(q) } } },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { phone: contains(q) },
            { accountLinks: { some: { client: { name: contains(q) } } } },
          ],
        }
      : {};

    // Lead people are Contacts now; only leads with no linked Contact still appear here.
    const leadWhere = {
      primaryContactId: null,
      ...(textFilter
        ? {
            OR: [
              { primaryContact: contains(q) },
              { email: contains(q) },
              { phone: contains(q) },
              { organization: contains(q) },
            ],
          }
        : {}),
    };

    const bookingWhere = textFilter
      ? {
          OR: [{ guestName: contains(q) }, { guestEmail: contains(q) }, { guestOrg: contains(q) }],
        }
      : {};

    const taskWhere = textFilter
      ? { OR: [{ submitterEmail: contains(q) }, { submitterName: contains(q) }] }
      : {
          OR: [{ submitterEmail: { not: null } }, { submitterName: { not: null } }],
        };

    const [
      users,
      projectContacts,
      crmContacts,
      leads,
      bookings,
      taskSubmitters,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          role: true,
          tenantRole: { select: { key: true } },
          avatarUrl: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }],
        take,
      }),
      this.prisma.projectContact.findMany({
        where: projectContactWhere,
        include: { project: { select: { name: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take,
      }),
      this.prisma.contact.findMany({
        where: contactWhere,
        include: {
          emails: { select: { email: true, isPrimary: true }, orderBy: { isPrimary: 'desc' } },
          accountLinks: { select: { client: { select: { name: true } } }, take: 1 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take,
      }),
      this.prisma.lead.findMany({
        where: leadWhere,
        select: { id: true, primaryContact: true, email: true, phone: true, organization: true },
        orderBy: { organization: 'asc' },
        take,
      }),
      this.prisma.booking.findMany({
        where: bookingWhere,
        select: { id: true, guestName: true, guestEmail: true, guestOrg: true },
        orderBy: { startAt: 'desc' },
        take,
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        select: { submitterEmail: true, submitterName: true },
        orderBy: { createdAt: 'desc' },
        take: take * 2,
      }),
    ]);

    const candidates: PeopleDirectoryEntry[] = [];

    for (const u of users) {
      const firstName = trimOrEmpty(u.firstName);
      const lastName = trimOrEmpty(u.lastName);
      const email = trimOrEmpty(u.email);
      const roleLabel = u.tenantRole?.key === GUEST_ROLE.key ? 'Guest collaborator' : 'Team member';
      candidates.push({
        id: `user:${u.id}`,
        source: 'USER',
        sourceLabel: roleLabel,
        firstName,
        lastName,
        email,
        phone: '',
        displayName: personName(u),
        avatarUrl: u.avatarUrl,
      });
    }

    for (const c of projectContacts) {
      const firstName = trimOrEmpty(c.firstName);
      const lastName = trimOrEmpty(c.lastName);
      const email = trimOrEmpty(c.email);
      const phone = trimOrEmpty(c.phone);
      candidates.push({
        id: `project-contact:${c.id}`,
        source: 'PROJECT_CONTACT',
        sourceLabel: `Project · ${c.project.name}`,
        firstName,
        lastName,
        email,
        phone,
        displayName: displayName(firstName, lastName, email || phone),
        avatarUrl: null,
      });
    }

    for (const c of crmContacts) {
      const firstName = trimOrEmpty(c.firstName);
      const lastName = trimOrEmpty(c.lastName);
      const email = trimOrEmpty(c.emails[0]?.email);
      const phone = trimOrEmpty(c.phone);
      const accountName = c.accountLinks[0]?.client.name;
      candidates.push({
        id: `contact:${c.id}`,
        source: 'CONTACT',
        sourceLabel: accountName ? `Contact · ${accountName}` : 'Contact',
        firstName,
        lastName,
        email,
        phone,
        displayName: displayName(firstName, lastName, email),
        avatarUrl: c.avatarUrl,
      });
    }

    for (const lead of leads) {
      const { firstName, lastName } = splitName(lead.primaryContact);
      const email = trimOrEmpty(lead.email);
      const phone = trimOrEmpty(lead.phone);
      candidates.push({
        id: `lead:${lead.id}`,
        source: 'PIPELINE',
        sourceLabel: `Pipeline · ${lead.organization}`,
        firstName,
        lastName,
        email,
        phone,
        displayName: displayName(firstName, lastName, lead.primaryContact ?? lead.organization),
        avatarUrl: null,
      });
    }

    for (const b of bookings) {
      const { firstName, lastName } = splitName(b.guestName);
      const email = trimOrEmpty(b.guestEmail);
      candidates.push({
        id: `booking:${b.id}`,
        source: 'BOOKING',
        sourceLabel: b.guestOrg ? `Booking · ${b.guestOrg}` : 'Booking',
        firstName,
        lastName,
        email,
        phone: '',
        displayName: displayName(firstName, lastName, b.guestName),
        avatarUrl: null,
      });
    }

    const seenSubmitters = new Set<string>();
    for (const t of taskSubmitters) {
      const email = trimOrEmpty(t.submitterEmail);
      const name = trimOrEmpty(t.submitterName);
      if (!email && !name) continue;
      const dedupe = normalizeEmail(email) || name.toLowerCase();
      if (seenSubmitters.has(dedupe)) continue;
      seenSubmitters.add(dedupe);
      const { firstName, lastName } = splitName(name);
      candidates.push({
        id: `task-form:${dedupe}`,
        source: 'TASK_FORM',
        sourceLabel: 'Task form',
        firstName,
        lastName,
        email,
        phone: '',
        displayName: displayName(firstName, lastName, name || email),
        avatarUrl: null,
      });
    }

    return mergeEntries(candidates, cap);
  }
}
