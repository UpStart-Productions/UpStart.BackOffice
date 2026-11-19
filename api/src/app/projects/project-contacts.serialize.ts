import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';

export type ProjectContactWithLink = {
  id: string;
  contactId: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  sortOrder: number;
  contact?: { id: string; avatarUrl: string | null } | null;
};

export type ProjectContactDto = {
  id: string;
  contactId: string | null;
  firstName: string;
  lastName: string;
  title: string;
  phone: string;
  email: string;
  avatarUrl: string | null;
  sortOrder: number;
};

/** Live avatar + contactId for API responses (CRM contact is source of truth when linked). */
export async function serializeProjectContacts(
  prisma: PrismaService,
  contacts: ProjectContactWithLink[],
): Promise<ProjectContactDto[]> {
  const needEmail = contacts.filter((c) => !c.contactId && c.email?.trim());
  const emails = [...new Set(needEmail.map((c) => c.email!.trim().toLowerCase()))];
  const byEmail = new Map<string, { contactId: string; avatarUrl: string | null }>();

  const linkedContactIds = [
    ...new Set(contacts.map((c) => c.contactId).filter((id): id is string => !!id)),
  ];
  const linkedById = new Map<
    string,
    { phone: string | null; email: string | null; avatarUrl: string | null; title: string | null }
  >();
  if (linkedContactIds.length) {
    const linkedRows = await prisma.contact.findMany({
      where: { id: { in: linkedContactIds } },
      select: {
        id: true,
        title: true,
        phone: true,
        avatarUrl: true,
        emails: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: { email: true },
        },
      },
    });
    for (const row of linkedRows) {
      linkedById.set(row.id, {
        phone: row.phone,
        email: row.emails[0]?.email ?? null,
        avatarUrl: row.avatarUrl,
        title: row.title,
      });
    }
  }

  if (emails.length) {
    const rows = await prisma.contactEmail.findMany({
      where: {
        OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
      },
      select: {
        email: true,
        contactId: true,
        contact: { select: { avatarUrl: true } },
      },
    });
    for (const row of rows) {
      byEmail.set(row.email.toLowerCase(), {
        contactId: row.contactId,
        avatarUrl: row.contact.avatarUrl,
      });
    }
  }

  const backfills: Promise<unknown>[] = [];

  const mapped = contacts.map((c) => {
    let contactId = c.contactId;
    let linkedAvatar = c.contact?.avatarUrl ?? null;

    if (!contactId && c.email?.trim()) {
      const hit = byEmail.get(c.email.trim().toLowerCase());
      if (hit) {
        contactId = hit.contactId;
        linkedAvatar = hit.avatarUrl;
        backfills.push(
          prisma.projectContact.update({
            where: { id: c.id },
            data: { contactId: hit.contactId },
          }),
        );
      }
    }

    const linked = contactId ? linkedById.get(contactId) : undefined;
    const phone = (c.phone?.trim() || linked?.phone?.trim() || '').trim();
    const email = (c.email?.trim() || linked?.email?.trim() || '').trim();
    const title = (linked?.title?.trim() || '').trim();
    const avatarRaw = contactId
      ? (linkedAvatar ?? linked?.avatarUrl ?? c.avatarUrl)
      : c.avatarUrl;
    return {
      id: c.id,
      contactId,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      title,
      phone,
      email,
      avatarUrl: toPublicAssetUrl(avatarRaw),
      sortOrder: c.sortOrder,
    };
  });

  if (backfills.length) {
    await Promise.all(backfills);
  }

  return mapped;
}