import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectContactInputDto } from './dto/project-contact.dto';

async function snapshotFromContact(prisma: PrismaService, contactId: string) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId },
    include: {
      emails: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 },
    },
  });
  if (!contact) throw new BadRequestException('Linked person not found.');
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    email: contact.emails[0]?.email ?? null,
    avatarUrl: contact.avatarUrl,
  };
}

export async function syncProjectContacts(
  prisma: PrismaService,
  projectId: string,
  contacts: ProjectContactInputDto[],
) {
  const trim = (value?: string) => value?.trim() || null;

  let rows = await Promise.all(
    contacts.map(async (contact, index) => {
      const contactId = contact.contactId?.trim() || null;
      let firstName = trim(contact.firstName);
      let lastName = trim(contact.lastName);
      let phone = trim(contact.phone);
      let email = trim(contact.email);
      let avatarUrl = contact.avatarUrl;

      if (contactId) {
        const snap = await snapshotFromContact(prisma, contactId);
        firstName = snap.firstName;
        lastName = snap.lastName;
        phone = snap.phone;
        email = snap.email;
        avatarUrl = snap.avatarUrl;
      }

      return {
        id: contact.id,
        contactId,
        firstName,
        lastName,
        phone,
        email,
        avatarUrl,
        sortOrder: contact.sortOrder ?? index,
      };
    }),
  );

  rows = rows.filter(
    (contact) =>
      contact.contactId ||
      contact.firstName ||
      contact.lastName ||
      contact.phone ||
      contact.email,
  );

  const contactIds = rows
    .map((row) => row.contactId)
    .filter((id): id is string => !!id);
  if (new Set(contactIds).size !== contactIds.length) {
    throw new BadRequestException('Each person can only appear once on this project');
  }

  const emails = rows
    .map((contact) => contact.email?.toLowerCase())
    .filter((email): email is string => !!email);
  if (new Set(emails).size !== emails.length) {
    throw new BadRequestException('Contact emails must be unique on this project');
  }

  const existing = await prisma.projectContact.findMany({ where: { projectId } });
  const incomingIds = new Set(rows.filter((row) => row.id).map((row) => row.id!));

  for (const contact of existing) {
    if (!incomingIds.has(contact.id)) {
      await prisma.projectContact.delete({ where: { id: contact.id } });
    }
  }

  for (const row of rows) {
    const data = {
      contactId: row.contactId,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      email: row.email,
      avatarUrl: row.avatarUrl,
      sortOrder: row.sortOrder,
    };

    if (row.id && existing.some((contact) => contact.id === row.id)) {
      await prisma.projectContact.update({ where: { id: row.id }, data });
    } else {
      await prisma.projectContact.create({ data: { projectId, ...data } });
    }
  }
}
