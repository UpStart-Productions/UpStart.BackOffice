import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectContactInputDto } from './dto/project-contact.dto';

export async function syncProjectContacts(
  prisma: PrismaService,
  projectId: string,
  contacts: ProjectContactInputDto[],
) {
  const trim = (value?: string) => value?.trim() || null;

  const rows = contacts
    .map((contact, index) => ({
      id: contact.id,
      firstName: trim(contact.firstName),
      lastName: trim(contact.lastName),
      phone: trim(contact.phone),
      email: trim(contact.email),
      sortOrder: contact.sortOrder ?? index,
    }))
    .filter(
      (contact) =>
        contact.firstName || contact.lastName || contact.phone || contact.email,
    );

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
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      email: row.email,
      sortOrder: row.sortOrder,
    };

    if (row.id && existing.some((contact) => contact.id === row.id)) {
      await prisma.projectContact.update({ where: { id: row.id }, data });
    } else {
      await prisma.projectContact.create({ data: { projectId, ...data } });
    }
  }
}
