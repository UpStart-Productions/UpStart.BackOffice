/**
 * Demo expense rows on real client projects (local DB only).
 *
 *   npm run seed:expenses              insert ~30 expenses (default count)
 *   npm run seed:expenses -- --count=40
 *   npm run seed:expenses -- --tenant upstart
 *   npm run seed:expenses -- --clean   remove seeded rows and exit
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { disconnect, prisma, runForTenant } from './lib/tenant-prisma';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SEED_NOTE = 'seed-expenses-demo';

const databaseUrl = process.env.DATABASE_URL ?? '';
let host = '';
try {
  host = new URL(databaseUrl).hostname;
} catch {
  /* handled below */
}
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
  console.error(`Refusing to run: DATABASE_URL host is "${host || 'unset'}", not this machine.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const cleanOnly = args.includes('--clean');
const count = Math.max(1, Math.min(200, Number(args.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 30)));

const DESCRIPTIONS = [
  'Adobe Creative Cloud — monthly',
  'Zoom Pro subscription',
  'Client lunch — project kickoff',
  'Parking — downtown client visit',
  'Office supplies — printer paper',
  'USB-C hub and cables',
  'Domain renewal',
  'Stock photo license pack',
  'Courier — printed proofs',
  'Hotel — overnight site visit',
  'Rental car — client location',
  'Team coffee run',
  'Figma seat (1 month)',
  'Notion workspace',
  'Hardware store — mounting supplies',
  'Postage — mailed contracts',
  'Background check service fee',
  'Conference registration',
  'Training course — accessibility',
  'Cloud storage upgrade',
  'Phone bill — business line',
  'Internet — home office stipend',
  'Software plugin license',
  'Printing — large format poster',
  'Taxi to airport',
  'Airfare — client workshop',
  'Meals — working dinner',
  'Whiteboard markers and erasers',
  'Battery backup for laptop',
  'Shredder service — document disposal',
  'Client gift — project milestone',
  'Wire transfer fee',
];

const CATEGORIES = ['Software', 'Travel', 'Meals', 'Supplies', 'Contractor', 'Advertising', 'Other'];
const PAYMENTS = ['Corporate card', 'Personal card', 'Cash', 'Check', 'ACH'];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20261105);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const randomAmount = () => Math.round((8 + rand() * 420) * 100) / 100;

async function clean() {
  const r = await prisma.expense.deleteMany({ where: { notes: SEED_NOTE } });
  console.log(`Removed ${r.count} seeded expense(s).`);
}

async function seed() {
  const user = await prisma.user.findFirst({
    orderBy: { email: 'asc' },
    select: { id: true, email: true },
  });
  if (!user) throw new Error('No users in this tenant. Sign in once or run add-admin-user.');

  const projects = await prisma.project.findMany({
    where: {
      isActive: true,
      client: { journey: 'CLIENT' },
    },
    orderBy: [{ client: { name: 'asc' } }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      defaultExpenseBillable: true,
      defaultExpenseReimbursable: true,
      client: { select: { id: true, name: true } },
    },
  });

  if (!projects.length) {
    throw new Error('No active projects on Client accounts. Add a client and project first.');
  }

  console.log(`Using submitter: ${user.email}`);
  console.log(`Projects (${projects.length}): ${projects.map((p) => p.client?.name).filter(Boolean).join(', ')}`);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rows: Parameters<typeof prisma.expense.create>[0]['data'][] = [];

  for (let i = 0; i < count; i++) {
    const project = projects[i % projects.length]!;
    const daysAgo = Math.floor(rand() * 92) + 1;
    const incurredAt = new Date(now - daysAgo * day - Math.floor(rand() * day));
    const billable = project.defaultExpenseBillable ?? rand() > 0.55;
    const reimbursable = project.defaultExpenseReimbursable ?? rand() > 0.65;

    rows.push({
      userId: user.id,
      projectId: project.id,
      description: pick(DESCRIPTIONS),
      amount: randomAmount(),
      category: pick(CATEGORIES),
      incurredAt,
      isBillable: billable,
      isReimbursable: reimbursable,
      paymentMethod: pick(PAYMENTS),
      notes: SEED_NOTE,
      createdByUserId: user.id,
      updatedByUserId: user.id,
    });
  }

  let created = 0;
  for (const data of rows) {
    await prisma.expense.create({ data });
    created++;
  }

  console.log(`Created ${created} expenses across ${projects.length} project(s).`);
  console.log('Refresh Expenses in the app (widen the period if needed).');
  console.log(`Remove anytime: npm run seed:expenses -- --clean`);
}

runForTenant(async () => {
  if (cleanOnly) {
    await clean();
    return;
  }
  await clean();
  await seed();
})
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => disconnect());
