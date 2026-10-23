/**
 * Local-only demo data for the Inbox, Contacts and Activity screens (UI polish).
 *
 *   npm run seed:inbox                 reseed: removes earlier seed data, then inserts it (40 bulk emails)
 *   npm run seed:inbox -- --bulk=0     only the hand-written edge cases
 *   npm run seed:inbox -- --bulk=120   more bulk emails (the Inbox pages at 50)
 *   npm run seed:inbox -- --clean      remove seed data and stop
 *
 * Everything it creates is recognizable and removed by --clean: emails use a "seed-inbox" Message-ID,
 * people use @seed.ubo.local, and the demo clients/lead are named "Seed: ...". It refuses to run
 * unless DATABASE_URL points at this machine.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { disconnect, prisma, runForTenant } from '../lib/tenant-prisma';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const TENANT = 'default'; // DEFAULT_TENANT_ID in api/src/app/communications/communications.constants.ts
const MARK = 'seed-inbox';
const DOMAIN = 'seed.ubo.local';
const CLIENT_CODES = ['SEEDMG', 'SEEDRB'];
const LEAD_ORG = 'Seed: Cascade Youth Alliance';

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
const bulk = Number(args.find((a) => a.startsWith('--bulk='))?.split('=')[1] ?? 40);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

// Small deterministic PRNG so reseeding gives the same bulk data.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

type Role = 'FROM' | 'TO' | 'CC';
type Person = { name?: string; email: string };
const person = (local: string, name?: string): Person => ({ name, email: `${local}@${DOMAIN}` });

const TEAM = person('jeff.team', 'Jeff Denton');
const TEAM2 = person('lori.team', 'Lori Hart');
const dana = person('dana.whitfield', 'Dana Whitfield');
const marcus = person('marcus.reyes', 'Marcus Reyes');
const priya = person('priya.nair', 'Priya Nair');
const lee = person('lee.chen', 'Lee Chen');
const sam = person('sam.ortiz', 'Sam Ortiz'); // linked to both demo clients, so mail from Sam needs a manual choice
const tom = person('tom.okafor', 'Tom Okafor'); // auto-created from an email, not yet reviewed
const rosa = person('rosa.delgado', 'Rosa Delgado');
const nameless = person('office.manager');

const participants = (from: Person, to: Person[], cc: Person[] = []) => [
  { role: 'FROM' as Role, ...from },
  ...to.map((x) => ({ role: 'TO' as Role, ...x })),
  ...cc.map((x) => ({ role: 'CC' as Role, ...x })),
];

let messageCount = 0;
const newMessageId = () => `<${MARK}-${++messageCount}@${DOMAIN}>`;

async function clean() {
  const emails = await prisma.contactEmail.findMany({
    where: { tenantId: TENANT, email: { endsWith: `@${DOMAIN}` } },
    select: { contactId: true },
  });
  const clients = await prisma.client.findMany({ where: { code: { in: CLIENT_CODES } }, select: { id: true } });
  const leads = await prisma.lead.findMany({ where: { organization: LEAD_ORG }, select: { id: true } });

  const gone = await prisma.interaction.deleteMany({
    where: {
      tenantId: TENANT,
      OR: [
        { messageId: { startsWith: `<${MARK}-` } },
        { clientId: { in: clients.map((c) => c.id) } },
        { leadId: { in: leads.map((l) => l.id) } },
      ],
    },
  });
  await prisma.contact.deleteMany({ where: { id: { in: emails.map((e) => e.contactId) } } });
  await prisma.client.deleteMany({ where: { code: { in: CLIENT_CODES } } });
  await prisma.lead.deleteMany({ where: { organization: LEAD_ORG } });
  console.log(`Removed earlier seed data (${gone.count} interactions).`);
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT } });
  if (!tenant) throw new Error(`Tenant "${TENANT}" not found. Start the API once so it creates it, then rerun.`);

  await clean();
  if (cleanOnly) return;

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
  const captureEmail = admin?.email ?? TEAM.email;

  // ── Accounts and a lead to file against ──────────────────────────────────────────
  const maple = await prisma.client.create({
    data: { name: 'Seed: Maple Grove Family Care', code: 'SEEDMG', email: dana.email, notes: 'Demo data from seed-inbox.' },
  });
  const river = await prisma.client.create({
    data: { name: 'Seed: Riverbend Senior Services', code: 'SEEDRB', email: priya.email, notes: 'Demo data from seed-inbox.' },
  });
  const lead = await prisma.lead.create({
    data: { organization: LEAD_ORG, primaryContact: rosa.name, email: rosa.email, stage: 'DISCOVERY' },
  });

  // ── People ──────────────────────────────────────────────────────────────────────
  const makeContact = async (
    p: Person,
    opts: { title?: string; autoCreated?: boolean; links?: { clientId: string; role: string }[]; lastContactAt?: Date } = {},
  ) => {
    const [firstName, ...rest] = (p.name ?? p.email.split('@')[0]).split(' ');
    return prisma.contact.create({
      data: {
        tenantId: TENANT,
        firstName,
        lastName: rest.join(' ') || null,
        title: opts.title,
        autoCreated: opts.autoCreated ?? false,
        lastContactAt: opts.lastContactAt,
        emails: { create: [{ tenantId: TENANT, email: p.email, isPrimary: true }] },
        accountLinks: { create: opts.links ?? [] },
      },
    });
  };
  const cDana = await makeContact(dana, { links: [{ clientId: maple.id, role: 'Daughter / POA' }], lastContactAt: ago(2 * DAY) });
  const cMarcus = await makeContact(marcus, { title: 'Case manager', links: [{ clientId: maple.id, role: 'Case manager' }], lastContactAt: ago(9 * DAY) });
  const cPriya = await makeContact(priya, { title: 'Director', links: [{ clientId: river.id, role: 'Director' }], lastContactAt: ago(1 * DAY) });
  await makeContact(lee, { links: [{ clientId: river.id, role: 'Billing contact' }] });
  const cSam = await makeContact(sam, {
    links: [
      { clientId: maple.id, role: 'Volunteer coordinator' },
      { clientId: river.id, role: 'Board member' },
    ],
    lastContactAt: ago(4 * HOUR),
  });
  const cTom = await makeContact(tom, { autoCreated: true, lastContactAt: ago(5 * MIN) });
  await makeContact(rosa, { autoCreated: true });
  const idByEmail: Record<string, string> = {
    [dana.email]: cDana.id,
    [marcus.email]: cMarcus.id,
    [priya.email]: cPriya.id,
    [sam.email]: cSam.id,
    [tom.email]: cTom.id,
  };

  // ── Interactions ───────────────────────────────────────────────────────────────
  type Spec = {
    type?: 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE';
    direction?: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
    when: Date;
    subject?: string | null;
    body?: string | null;
    from?: Person;
    to?: Person[];
    cc?: Person[];
    thread?: string;
    clientId?: string;
    leadId?: string;
    manual?: boolean; // logged by hand: no Message-ID, no capture
  };
  const add = async (s: Spec) => {
    const type = s.type ?? 'EMAIL';
    const isEmail = type === 'EMAIL';
    const filed = !!(s.clientId || s.leadId);
    const parts = s.from
      ? participants(s.from, s.to ?? [], s.cc ?? []).map((x) => ({ ...x, contactId: idByEmail[x.email] ?? null }))
      : (s.to ?? []).map((x) => ({ role: 'ATTENDEE' as const, ...x, contactId: idByEmail[x.email] ?? null }));
    return prisma.interaction.create({
      data: {
        tenantId: TENANT,
        type,
        direction: s.direction ?? 'INBOUND',
        occurredAt: s.when,
        subject: s.subject === undefined ? null : s.subject,
        bodyText: s.body ?? null,
        messageId: isEmail && !s.manual ? newMessageId() : null,
        threadKey: s.thread ?? null,
        source: s.manual || !isEmail ? 'MANUAL' : 'CC',
        status: filed ? 'FILED' : 'UNFILED',
        clientId: s.clientId ?? null,
        leadId: s.leadId ?? null,
        loggedByUserId: !isEmail || s.manual ? (admin?.id ?? null) : null,
        participants: { create: parts },
        captures: isEmail && !s.manual ? { create: [{ capturedByEmail: captureEmail, userId: admin?.id ?? null }] } : undefined,
      },
    });
  };

  const quoted = (who: string, when: string, text: string) =>
    `\n\nOn ${when}, ${who} wrote:\n${text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n')}`;
  const sig = (name: string) => `\n\nThanks,\n${name}`;
  const rosaThread = `mid:<${MARK}-thread-rosa@${DOMAIN}>`;

  // Hand-written Unfiled cases (each exercises something in the UI).
  await add({ when: ago(5 * MIN), subject: 'Quick question about the intake form', from: tom, to: [TEAM],
    body: `Hi Jeff,\n\nDo we need a signed release before the first visit, or can that wait until after the intake call?${sig('Tom')}` });
  await add({ when: ago(12 * MIN), subject: null, from: rosa, to: [TEAM], body: 'Sent from my phone. Call me when you can.' });
  await add({ when: ago(3 * HOUR), from: sam, to: [TEAM, TEAM2], cc: [],
    subject: 'Shared event planning: the spring open house, volunteer shifts, the catering order, parking plan, and a long list of things we still need to decide before the flyers go out next week',
    body: `Hi both,\n\nHere is where the open house stands.\n\n- Volunteer shifts: 14 of 20 filled\n- Catering: waiting on the second quote\n- Parking: the church lot is available after 10am\n\nCan we talk through the flyer wording on Thursday? I would like to send it to print by Friday at the latest.\n\nSome background for the newer folks: the open house started as a small coffee morning and has grown every year, so the logistics are bigger than they look.${sig('Sam')}` });
  await add({ when: ago(1 * DAY + 2 * HOUR), subject: 'Re: Tuesday visit', from: nameless, to: [TEAM], cc: [TEAM2],
    body: `Tuesday at 2pm works for us. We will have the paperwork ready.${quoted('Jeff Denton <jeff.team@seed.ubo.local>', 'Mon, Oct 19, 2026 at 9:12 AM', 'Could we do Tuesday afternoon for the site visit?\nI can bring the updated agreement.')}` });
  await add({ when: ago(3 * DAY + 5 * HOUR), subject: 'Program partnership: first call', from: rosa, to: [TEAM], thread: rosaThread,
    body: `Hi Jeff,\n\nThanks for taking my call. I am the program director at Cascade Youth Alliance and we are looking for help moving our volunteer tracking out of spreadsheets.\n\nWould you be open to a 30 minute intro next week?${sig('Rosa')}` });
  await add({ when: ago(3 * DAY + 2 * HOUR), direction: 'OUTBOUND', subject: 'Re: Program partnership: first call', from: TEAM, to: [rosa], thread: rosaThread,
    body: `Hi Rosa,\n\nHappy to. Does Wednesday at 10 work?${quoted('Rosa Delgado <rosa.delgado@seed.ubo.local>', 'Fri, Oct 16, 2026 at 11:03 AM', 'Would you be open to a 30 minute intro next week?')}` });
  await add({ when: ago(3 * DAY), subject: 'Re: Program partnership: first call', from: rosa, to: [TEAM], thread: rosaThread,
    body: `Wednesday at 10 is great. I will send an invite.${quoted('Jeff Denton <jeff.team@seed.ubo.local>', 'Fri, Oct 16, 2026 at 1:40 PM', 'Happy to. Does Wednesday at 10 work?')}` });
  await add({ when: ago(5 * DAY), subject: 'Board packet and agenda for November', from: sam,
    to: [TEAM, TEAM2, marcus, priya], cc: [dana, lee, nameless, rosa, tom, person('treasurer', 'Casey Whitaker')],
    body: 'Attached is the draft agenda. Please send corrections by Friday.' });
  await add({ when: ago(9 * DAY), subject: 'Invoice question', from: nameless, to: [TEAM], body: 'Is the October invoice the same amount as September?' });
  await add({ when: ago(14 * DAY), subject: 'Link that will not wrap', from: tom, to: [TEAM],
    body: `Here is the shared folder: https://example.com/${'very-long-path-segment-'.repeat(12)}index.html\n\nAnd a long token for overflow testing: ${'ABCDEFGHIJ'.repeat(30)}` });
  await add({ when: ago(21 * DAY), subject: 'Café meeting – ¿mañana? 🎉', from: person('jose.garcia', 'José García'), to: [TEAM],
    body: '¡Hola! ¿Podemos vernos mañana en el café? Tengo buenas noticias sobre la subvención. 🎉' });
  await add({ when: ago(40 * DAY), direction: 'OUTBOUND', subject: 'Following up on our conversation', from: TEAM, to: [person('d.park', 'Dev Park')], cc: [TEAM2],
    body: `Dev, it was good to meet at the conference. I would like to send you a short overview of what we are building.${sig('Jeff')}` });
  await add({ when: ago(400 * DAY), subject: 'Old thread from last year', from: person('archive.sender', 'Archive Sender'), to: [TEAM],
    body: 'This is here to check how dates older than a year are shown.' });
  await add({ when: ago(2 * DAY), subject: 'Subject but no message text', from: person('empty.body', 'Empty Body'), to: [TEAM], body: null });
  await add({ when: ago(6 * DAY), direction: 'INTERNAL', subject: 'Team note: office closed Friday', from: TEAM2, to: [TEAM],
    body: 'FYI the office is closed Friday. Forward anything urgent to my cell.' });

  // Generated bulk Unfiled mail (spread over ~4 months) so the Inbox pages and "Load older" appears.
  const senders = [rosa, tom, nameless, person('grants', 'Grants Office'), person('ana.silva', 'Ana Silva'), person('b.nguyen', 'B. Nguyen'), person('events', 'Events Desk')];
  const subjects = ['Meeting follow-up', 'Question about pricing', 'Intro from a mutual friend', 'Updated W-9', 'Re: schedule', 'Fwd: grant announcement', 'Thank you!', 'Can we reschedule?', 'Volunteer sign-up numbers', 'Quick favor'];
  for (let i = 0; i < bulk; i++) {
    await add({
      when: ago((6 + rand() * 120) * DAY),
      subject: `${pick(subjects)}${rand() < 0.3 ? ` #${i + 1}` : ''}`,
      from: pick(senders),
      to: [TEAM],
      body: rand() < 0.1 ? null : `Hi Jeff,\n\n${pick(['Following up on my last note.', 'Wanted to loop you in on this.', 'Let me know what works for you.', 'Details are below.'])}${sig('Best')}`,
    });
  }

  // Filed history for the Activity card (one account with a full mix, one lead).
  await add({ clientId: maple.id, when: ago(2 * DAY), subject: 'Updated medication schedule', from: dana, to: [TEAM], body: `Here is the updated schedule from the doctor's visit.${sig('Dana')}` });
  await add({ clientId: maple.id, direction: 'OUTBOUND', when: ago(2 * DAY + 3 * HOUR), subject: 'Re: Caregiver availability', from: TEAM, to: [dana], cc: [marcus],
    body: `Dana, we can cover Tuesday through Thursday.${quoted('Dana Whitfield <dana.whitfield@seed.ubo.local>', 'Tue, Oct 20, 2026 at 8:15 AM', 'Who is available next week?')}` });
  await add({ clientId: maple.id, type: 'CALL', manual: true, direction: 'OUTBOUND', when: ago(4 * DAY), subject: 'Intake call', body: 'Walked through the intake form. Dana will send the insurance card.', to: [dana] });
  await add({ clientId: maple.id, type: 'MEETING', manual: true, direction: 'INBOUND', when: ago(7 * DAY), subject: 'Family meeting', body: 'Dana and Marcus attended. Agreed on weekly check-ins.', to: [dana, marcus] });
  await add({ clientId: maple.id, type: 'NOTE', manual: true, direction: 'INTERNAL', when: ago(8 * DAY), subject: 'Next step', body: 'Send the service agreement once the insurance card arrives.' });
  await add({ clientId: maple.id, when: ago(9 * DAY), subject: 'Welcome packet received', from: marcus, to: [TEAM], body: 'Thanks, we received the welcome packet.' });
  await add({ clientId: river.id, when: ago(1 * DAY), subject: 'Renewal paperwork', from: priya, to: [TEAM, TEAM2], body: `Please find the renewal paperwork attached.${sig('Priya')}` });
  await add({ clientId: river.id, type: 'CALL', manual: true, direction: 'INBOUND', when: ago(12 * DAY), subject: 'Billing question', body: 'Lee called about the October invoice.', to: [lee] });
  await add({ leadId: lead.id, when: ago(3 * DAY), subject: 'Intro call scheduled', from: rosa, to: [TEAM], body: 'Wednesday at 10 works. Invite is on its way.' });
  await add({ leadId: lead.id, type: 'NOTE', manual: true, direction: 'INTERNAL', when: ago(2 * DAY), subject: 'Prep', body: 'Ask about their current spreadsheet setup before the call.' });

  const unfiled = await prisma.interaction.count({ where: { tenantId: TENANT, status: 'UNFILED' } });
  console.log(`Seeded. Unfiled inbox now holds ${unfiled} email(s); demo clients: ${maple.name}, ${river.name}; lead: ${LEAD_ORG}.`);
  console.log('Remove it all with: npm run seed:inbox -- --clean');
}

runForTenant(main)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => disconnect());
