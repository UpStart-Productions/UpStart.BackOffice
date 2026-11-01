import type { Prisma } from '@prisma/client';
import { normalizeEmail } from '../communications/email-address.util';
import { splitPersonName } from '../leads/lead-links.util';

type Db = Pick<Prisma.TransactionClient, 'client' | 'contact' | 'contactEmail' | 'contactAccount'>;

/**
 * A new client (status Client) from a form submission, with the sender as its person (reused when a person
 * already has that email).
 */
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
    const byEmail = email ? await db.contactEmail.findFirst({ where: { email }, select: { contactId: true } }) : null;
    const contactId =
      byEmail?.contactId ??
      (
        await db.contact.create({
          data: {
            firstName: person.firstName,
            lastName: person.lastName,
            phone: input.phone?.trim() || undefined,
            ...(email ? { emails: { create: { email, isPrimary: true } } } : {}),
          },
          select: { id: true },
        })
      ).id;
    await db.contactAccount.create({ data: { contactId, clientId: client.id, isPrimary: true } });
  }
  return client.id;
}
