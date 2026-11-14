import type { PermissionArea } from '@upstart/back-office/shared';

/**
 * JD's chat-box placeholder: a time-of-day greeting with the person's first name, then a nudge.
 * Smart nudges come from the person's own data (things that need them); otherwise a general one at
 * random. Every nudge is limited to areas the person's role can use.
 */

export type GreetingFacts = {
  firstName: string | null;
  can: (area: PermissionArea) => boolean;
  overdueTasks?: number;
  dueTodayTasks?: number;
  draftInvoices?: number;
  quietAccount?: string | null;
  unfiledEmails?: number;
  pendingSubmissions?: number;
};

type Nudge = { text: string; area?: PermissionArea };

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function greeting(name: string | null, now = new Date()): string {
  const h = now.getHours();
  const n = name ? `, ${name}` : '';
  const timed = h < 12 ? ['Good morning', 'Morning'] : h < 17 ? ['Good afternoon', 'Afternoon'] : ['Good evening', 'Evening'];
  const anyTime = name ? [`Hey ${name}`, `Hi ${name}`, `How's it going, ${name}?`] : ['Hey there', 'Hi there'];
  // Mostly the time of day; now and then a casual opener.
  if (Math.random() < 0.7) return `${pick(timed)}${n}.`;
  const g = pick(anyTime);
  return /[?.!]$/.test(g) ? g : `${g}.`;
}

/** General nudges, a dozen or so, each tied to the area it needs. */
const GENERAL: Nudge[] = [
  { text: 'Want to knock out some invoices today?', area: 'invoices' },
  { text: "What's first on the list?" },
  { text: 'Should we clear out those overdue tasks?', area: 'tasks' },
  { text: 'Anyone you need to follow up with?', area: 'inbox' },
  { text: 'Want me to draft a check-in email?', area: 'inbox' },
  { text: 'Need to log some time before you forget?', area: 'time' },
  { text: "Want to wrap up the day's time entries?", area: 'time' },
  { text: 'Anything to set up for tomorrow?', area: 'tasks' },
  { text: 'What are we getting done today?' },
  { text: 'Need a hand with a client record?', area: 'clients' },
  { text: "Want a quick rundown of what's due this week?", area: 'tasks' },
  { text: 'Should we build a new form?', area: 'forms' },
  { text: 'Want to move a pipeline card along?', area: 'pipeline' },
  { text: 'Need help finding something?' },
];

/** Nudges built from the person's own data. Empty when nothing stands out. */
function smartNudges(f: GreetingFacts): string[] {
  const out: string[] = [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (f.can('invoices') && f.draftInvoices) {
    out.push(`You've got ${f.draftInvoices} ${plural(f.draftInvoices, 'invoice', 'invoices')} ready to send. Want to knock ${plural(f.draftInvoices, 'it', 'those')} out?`);
  }
  if (f.can('tasks') && f.overdueTasks) {
    out.push(`${f.overdueTasks} ${plural(f.overdueTasks, 'task is', 'tasks are')} overdue. Want to tackle ${plural(f.overdueTasks, 'it', 'them')}?`);
  }
  if (f.can('tasks') && f.dueTodayTasks) {
    out.push(`${f.dueTodayTasks} ${plural(f.dueTodayTasks, 'task is', 'tasks are')} due today. Want to start there?`);
  }
  if (f.can('inbox') && f.quietAccount) {
    out.push(`${f.quietAccount} has gone quiet. Want me to draft a check-in?`);
  }
  if (f.can('inbox') && f.unfiledEmails) {
    out.push(`${f.unfiledEmails} ${plural(f.unfiledEmails, 'email needs', 'emails need')} filing. Want help sorting ${plural(f.unfiledEmails, 'it', 'them')}?`);
  }
  if (f.can('forms') && f.pendingSubmissions) {
    out.push(`${f.pendingSubmissions} form ${plural(f.pendingSubmissions, 'submission is', 'submissions are')} waiting for review.`);
  }
  return out;
}

/** One placeholder line. Smart nudges win two times in three when there are any. */
export function jdPlaceholder(f: GreetingFacts): string {
  const smart = smartNudges(f);
  const general = GENERAL.filter((g) => !g.area || f.can(g.area)).map((g) => g.text);
  const nudge = smart.length && (Math.random() < 0.67 || !general.length) ? pick(smart) : pick(general.length ? general : ['How can I help?']);
  return `${greeting(f.firstName)} ${nudge}`;
}
