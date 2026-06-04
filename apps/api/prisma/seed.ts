import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding...');

  const devUser = await prisma.user.upsert({
    where: { email: 'admin@upstart.test' },
    update: { role: 'ADMIN', isActive: true, hourlyRate: 150 },
    create: {
      email: 'admin@upstart.test',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
      hourlyRate: 150,
    },
  });
  console.log(`User: ${devUser.email}`);

  const jeff = await prisma.user.upsert({
    where: { email: 'jeff@heyupstart.com' },
    update: { role: 'ADMIN', isActive: true, hourlyRate: 150 },
    create: {
      email: 'jeff@heyupstart.com',
      firstName: 'Jeff',
      lastName: 'Denton',
      name: 'Jeff Denton',
      role: 'ADMIN',
      isActive: true,
      hourlyRate: 150,
    },
  });
  console.log(`User: ${jeff.email}`);

  const client = await prisma.client.upsert({
    where: { code: 'SMPL' },
    update: {},
    create: {
      name: 'Sample Client',
      code: 'SMPL',
      email: 'billing@sampleclient.com',
    },
  });
  console.log(`Client: ${client.name}`);

  await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      clientId: client.id,
      name: 'Website Redesign',
      hourlyRate: 150,
      isBillable: true,
    },
  });

  // ── Client Pipeline leads from Notion ────────────────────────────────────
  type LeadSeed = {
    organization: string;
    primaryContact?: string;
    contactRole?: string;
    email?: string;
    phone?: string;
    website?: string;
    stage: string;
    source?: string;
    warmConnection?: string;
    category?: string;
    serviceInterests?: string[];
    nextAction?: string;
    nextActionDate?: Date;
    lastContactDate?: Date;
    note?: string; // becomes a Note artifact
  };

  const leads: LeadSeed[] = [
    {
      organization: 'Furnish Hope',
      email: 'megan@furnishhope.com',
      website: 'https://www.furnishhope.com/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      nextAction: 'Find decision-maker contact name, then send email draft',
      nextActionDate: new Date('2026-04-10'),
      note: 'Based in Central Oregon (Bend area) — geography stretch for Phase 1, but very strong ICP fit. Mission: furnishing homes for people in need. Serves veterans, recovery graduates, unhoused individuals, disaster families, foster youth, DV survivors, disability. Relies on a network of referring agencies. No contact name found on site — research needed.',
    },
    {
      organization: 'Love INC of Newberg',
      primaryContact: 'Christopher White',
      contactRole: 'Executive Director',
      email: 'admin@loveincnewberg.org',
      website: 'https://loveincnewberg.org/',
      stage: 'ACTIVE_CLIENT',
      source: 'WARM_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      lastContactDate: new Date('2026-01-26'),
      nextActionDate: new Date('2026-04-08'),
      nextAction: 'Email Tracy White (Advertising/PR Director) — introduce GrovLink app concept, ask about website management',
      note: 'Jeff is on Spring fundraiser steering committee. Key contacts: Christopher White (ED), Beth (volunteer/board), Tracy White (advertising/PR — PRIMARY decision-maker for app). Running 2-3yr deficit.',
    },
    {
      organization: 'Provoking Hope',
      primaryContact: 'Diane Reynolds',
      contactRole: 'Executive Director',
      website: 'https://provokinghope.com/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'RECOVERY',
      serviceInterests: ['Informational Interview'],
      nextAction: 'Review email draft and send',
      nextActionDate: new Date('2026-04-07'),
      note: 'Strong ICP fit. Wrap-around recovery services in the Willamette Valley — mentors, parenting groups, sober living, drug court advocacy, harm reduction, youth recovery, and workforce training.',
    },
    {
      organization: 'MacHub',
      primaryContact: 'Cami Nyquist',
      contactRole: 'Executive Director & Co-Founder',
      email: 'admin@machub.org',
      website: 'https://www.machub.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      nextAction: 'Send email draft to Cami Nyquist',
      note: 'Also affiliated with Mac Habitat for Humanity.',
    },
    {
      organization: "Juliette's House",
      website: 'https://www.julietteshouse.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'OTHER',
      serviceInterests: ['Informational Interview'],
      note: 'Child abuse intervention. Sensitive mission area — approach carefully, lead with community visibility angle.',
    },
    {
      organization: 'White Bird Clinic',
      primaryContact: 'Hannah Hicks',
      website: 'https://whitebirdclinic.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      note: 'Hannah will be working here soon.',
    },
    {
      organization: 'Northwest Family Services',
      website: 'https://nwfs.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
    },
    {
      organization: 'Yamhill Community Action Partnership (YCAP)',
      primaryContact: 'Alexandra Ball',
      contactRole: 'Executive Director',
      website: 'https://yamhillcap.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      nextAction: 'Send email draft — consider targeting Amber Hansen-Moore (Deputy Director)',
      note: 'State org serving all of Yamhill County. 2M lbs of food/year across 35+ partner pantries. Anydoor Yamhill shows tech-forward thinking.',
    },
    {
      organization: 'City Team',
      primaryContact: 'Justice McGee',
      contactRole: 'Operations Coordinator',
      email: 'jmcgee@cityteam.org',
      website: 'https://www.cityteam.org/',
      stage: 'NEW_LEAD',
      source: 'WARM_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      warmConnection: 'Justice McGee: Operations Coordinator',
      nextAction: 'I met Justice McGee, Operations Coordinator, at a George Fox event.',
    },
    {
      organization: 'Marion & Polk Early Learning Hub',
      website: 'https://parentinghub.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      note: 'There are 16 Early Learning Hubs in Oregon. This could be a decent candidate for a GrovLink implementation.',
    },
    {
      organization: 'Chehalem Youth & Family Services',
      primaryContact: 'Charlie Rice',
      contactRole: 'Executive Director',
      website: 'https://cyfs.net/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      nextAction: 'Send email draft to Charlie Rice',
      note: 'Located in Newberg, OR — same town as Jeff. Founded 1970. 200+ people receive supportive services annually.',
    },
    {
      organization: 'Stand Up Girl',
      website: 'https://standupgirl.com/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'YOUTH',
      serviceInterests: ['Informational Interview'],
    },
    {
      organization: 'Homeward Bound Pets',
      website: 'https://hbpets.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'PETS',
      serviceInterests: ['Informational Interview'],
      note: 'Department of the Humane Society.',
    },
    {
      organization: 'The Peer Company / MHA Oregon',
      primaryContact: 'Janie Gullickson',
      contactRole: 'Executive Director',
      email: 'tmccarthy@mhaoforegon.org',
      website: 'https://mhaoforegon.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'RECOVERY',
      serviceInterests: ['Informational Interview'],
      warmConnection: 'James Hinton (AA James) works here — warm intro possible',
      note: 'Also: Tarra McCarthy, Director of Development & Community Engagement.',
    },
    {
      organization: 'Community Action Partnerships of Oregon',
      website: 'https://www.caporegon.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      note: 'State parent org of YCAP. Umbrella for 18 community orgs across Oregon. High leverage if relationship develops.',
    },
    {
      organization: 'The Giving Plate',
      website: 'https://www.thegivingplate.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'HUNGER',
      serviceInterests: ['Informational Interview'],
      note: 'Shelley Gibbs did some work with them.',
    },
    {
      organization: 'Transition Oregon',
      website: 'https://transitionoregon.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'YOUTH',
      serviceInterests: ['Informational Interview'],
      warmConnection: 'Multiple existing contacts on staff — check org directory for current names',
    },
    {
      organization: 'Opportunity Oregon',
      website: 'https://www.opport-unity.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'JOBS_WORKFORCE',
      serviceInterests: ['Informational Interview'],
      note: 'Focus: incarceration-to-work. Strong mission alignment with recovery community.',
    },
    {
      organization: 'Nestucca Valley Community Alliance',
      website: 'https://www.facebook.com/p/Nestucca-Valley-Community-Alliance-100064842514398/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'EDUCATION',
      serviceInterests: ['Informational Interview'],
      note: 'Facebook-only web presence — no standalone site found. Strong signal of digital visibility gap.',
    },
    {
      organization: 'Unidos (Yamhill County)',
      website: 'https://unidosyamhillcounty.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'OTHER',
      serviceInterests: ['Informational Interview'],
      note: 'Immigration and social services. Multilingual community — potential for high-impact visibility work.',
    },
    {
      organization: 'Yoop',
      website: 'https://www.myyoop.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
    },
    {
      organization: '211 Info',
      website: 'https://www.211info.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FAMILY',
      serviceInterests: ['Informational Interview'],
      note: 'Large org — serves all of Oregon and several WA counties. High visibility, may have more bureaucracy.',
    },
    {
      organization: 'Oregon Impact Fund',
      website: 'https://oregoncf.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'FUNDING',
      serviceInterests: ['Informational Interview'],
      note: 'Funding source, not a direct GrovLink client prospect. Track as relationship to cultivate.',
    },
    {
      organization: 'Recovery Works Northwest',
      website: 'https://www.recoveryworksnw.com/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'RECOVERY',
      serviceInterests: ['Informational Interview'],
      warmConnection: 'AA Dale uses this org in his recovery — potential warm intro',
    },
    {
      organization: 'Alliance Services',
      website: 'https://alliance-services.org/',
      stage: 'NEW_LEAD',
      source: 'COLD_OUTREACH',
      category: 'DISABILITY',
      serviceInterests: ['Informational Interview'],
    },
  ];

  for (const { note, ...leadData } of leads) {
    const existing = await prisma.lead.findFirst({
      where: { organization: leadData.organization },
    });
    if (existing) {
      console.log(`Lead (exists): ${leadData.organization}`);
    } else {
      const lead = await prisma.lead.create({ data: leadData });
      console.log(`Lead (created): ${leadData.organization}`);
      if (note) {
        await prisma.artifact.create({
          data: {
            leadId: lead.id,
            type: 'NOTE',
            title: 'Research Notes',
            content: `<p>${note}</p>`,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
