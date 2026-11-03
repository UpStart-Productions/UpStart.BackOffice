import type { Prisma } from '@prisma/client';
import { normalizeEmail } from '../communications/email-address.util';
import { freeContactEmail, splitPersonName } from '../leads/lead-links.util';

type Db = Pick<Prisma.TransactionClient, 'client' | 'contact' | 'contactEmail' | 'contactAccount'>;

/** A new client (status Client) from a form submission, with the sender as a new person on it. */
export async function createClientWithPerson(
  db: Db,
  input: { name: string; personName: string | null; email: string | null; phone: string | null },
): Promise<string> {
  const email = normalizeEmail(input.email);
  const client = await db.client.create({
    data: { name: input.name.trim(), journey: 'CLIENT', email: email ?? undefined, phone: input.phone?.trim() || undefined },
    select: { id: true },
  });
  const person = splitPersonName(input.personName, email);
  if (person) {
    const contactEmail = await freeContactEmail(db, email);
    const { id: contactId } = await db.contact.create({
      data: {
        firstName: person.firstName,
        lastName: person.lastName,
        phone: input.phone?.trim() || undefined,
        ...(contactEmail ? { emails: { create: { email: contactEmail, isPrimary: true } } } : {}),
      },
      select: { id: true },
    });
    await db.contactAccount.create({ data: { contactId, clientId: client.id, isPrimary: true } });
  }
  return client.id;
}
