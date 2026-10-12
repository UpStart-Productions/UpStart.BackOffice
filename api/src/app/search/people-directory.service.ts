import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { personName } from '../task-manager/task-people.util';

export type PeopleDirectoryEntry = {
  /** Stable key for UI (deduped). */
  id: string;
  source: 'USER' | 'PROJECT_CONTACT' | 'NETWORK' | 'PIPELINE' | 'BOOKING' | 'TASK_FORM';
  sourceLabel: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  displayName: string;
};

const PER_SOURCE = 8;
const DEFAULT_LIMIT = 25;

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

function mergeEntries(entries: PeopleDirectoryEntry[], limit: number): PeopleDirectoryEntry[] {
  const byKey = new Map<string, PeopleDirectoryEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    // Prefer the row with more contact detail.
    const score = (e: PeopleDirectoryEntry) =>
      (e.email ? 1 : 0) + (e.phone ? 1 : 0) + (e.firstName ? 1 : 0) + (e.lastName ? 1 : 0);
    if (score(entry) > score(existing)) byKey.set(key, entry);
  }
  return [...byKey.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
    .slice(0, limit);
}

@Injectable()
export class PeopleDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(qRaw: string, excludeProjectId?: string, limit = DEFAULT_LIMIT): Promise<PeopleDirectoryEntry[]> {
    const q = qRaw.trim();
    if (q.length < 2) return [];

    const cap = Math.min(Math.max(limit, 1), 50);
    const take = PER_SOURCE;

    const [
      users,
      projectContacts,
      networkContacts,
      leads,
      bookings,
      taskSubmitters,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { email: contains(q) },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { name: contains(q) },
          ],
        },
        select: { id: true, email: true, firstName: true, lastName: true, name: true, role: true },
        orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
        take,
      }),
      this.prisma.projectContact.findMany({
        where: {
          ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
          OR: [
            { email: contains(q) },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { phone: contains(q) },
          ],
        },
        include: { project: { select: { name: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take,
      }),
      this.prisma.networkContact.findMany({
        where: {
          OR: [
            { email: contains(q) },
            { firstName: contains(q) },
            { lastName: contains(q) },
            { phone: contains(q) },
            { company: { name: contains(q) } },
          ],
        },
        include: { company: { select: { name: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take,
      }),
      this.prisma.lead.findMany({
        where: {
          OR: [
            { primaryContact: contains(q) },
            { email: contains(q) },
            { phone: contains(q) },
            { organization: contains(q) },
          ],
        },
        select: { id: true, primaryContact: true, email: true, phone: true, organization: true },
        orderBy: { organization: 'asc' },
        take,
      }),
      this.prisma.booking.findMany({
        where: {
          OR: [
            { guestName: contains(q) },
            { guestEmail: contains(q) },
            { guestOrg: contains(q) },
          ],
        },
        select: { id: true, guestName: true, guestEmail: true, guestOrg: true },
        orderBy: { startAt: 'desc' },
        take,
      }),
      this.prisma.task.findMany({
        where: {
          OR: [{ submitterEmail: contains(q) }, { submitterName: contains(q) }],
        },
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
      const roleLabel = u.role === 'GUEST' ? 'Guest collaborator' : 'Team member';
      candidates.push({
        id: `user:${u.id}`,
        source: 'USER',
        sourceLabel: roleLabel,
        firstName,
        lastName,
        email,
        phone: '',
        displayName: personName(u),
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
      });
    }

    for (const c of networkContacts) {
      const firstName = trimOrEmpty(c.firstName);
      const lastName = trimOrEmpty(c.lastName);
      const email = trimOrEmpty(c.email);
      const phone = trimOrEmpty(c.phone);
      candidates.push({
        id: `network:${c.id}`,
        source: 'NETWORK',
        sourceLabel: `Network · ${c.company.name}`,
        firstName,
        lastName,
        email,
        phone,
        displayName: displayName(firstName, lastName, email),
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
      });
    }

    return mergeEntries(candidates, cap);
  }
}
