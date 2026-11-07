import type { UserContext } from '../common/app.types';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import type { AccountJourneyValue } from './dto/create-client.dto';

/** Minimal organization for spreadsheet import — Partner/other by default, no CRM tags. */
export async function createOrganizationFromImport(
  prisma: PrismaService,
  storageFolders: StorageFoldersService,
  access: AccessService,
  user: UserContext | undefined,
  input: { name: string; journey?: AccountJourneyValue; email?: string | null; phone?: string | null },
): Promise<string> {
  const journey = input.journey ?? 'NONE';
  const client = await prisma.client.create({
    data: {
      name: input.name.trim(),
      journey,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
      isActive: true,
    },
    select: { id: true },
  });
  if (user && access.level(user, 'clients') !== 'all') {
    await prisma.clientAssignment.create({ data: { clientId: client.id, userId: user.id } });
  }
  await storageFolders.ensureClientFolders(client.id);
  return client.id;
}
