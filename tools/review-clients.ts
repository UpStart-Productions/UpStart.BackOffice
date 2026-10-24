/**
 * Read-only report: which Accounts marked Client look like they are not doing work with you yet?
 *   npx tsx tools/review-clients.ts [--tenant <slug>]
 * An Account is a "likely not a client" when it has no projects, no time entries, no invoices and no
 * assigned users. Fix each one in the app from its Status field (Prospect, Past client, Other).
 * Nothing is changed by this tool.
 */
import { disconnect, prisma, runForTenant } from './lib/tenant-prisma';

async function main() {
  const accounts = await prisma.client.findMany({
    where: { journey: 'CLIENT' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      tags: { select: { tag: { select: { name: true } } } },
      _count: { select: { projects: true, timeEntries: true, invoices: true, users: true, interactions: true, leads: true } },
    },
  });

  const idle = accounts.filter((a) => !a._count.projects && !a._count.timeEntries && !a._count.invoices && !a._count.users);
  console.log(`\n${accounts.length} accounts are marked Client; ${idle.length} have no projects, time, invoices or users.\n`);
  if (!idle.length) return;

  const rows = idle.map((a) => {
    const tags = a.tags.map((t) => t.tag.name);
    return {
    name: a.name,
    code: a.code ?? '',
    tags: tags.join(', '),
    emails: a._count.interactions,
    pipeline: a._count.leads,
    created: a.createdAt.toISOString().slice(0, 10),
    suggest: a._count.leads ? 'Prospect (has a pipeline item)' : tags.includes('Partner') ? 'Other (partner)' : 'Review',
    };
  });
  console.table(rows);
  console.log('Open each in the app and set its Status. Anything you are doing work for stays a Client.');
}

runForTenant(main)
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => disconnect());
