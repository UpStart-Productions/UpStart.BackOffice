/**
 * One-off Asana → Back Office Tasks import (one Asana project at a time).
 *
 * Self-contained (only @prisma/client, @prisma/adapter-pg, @aws-sdk/client-s3) so it can run
 * from your Mac (via an SSH tunnel to the prod DB) or be copied into the API container.
 *
 * Needs an Asana Personal Access Token (full read access incl. comments/attachments):
 *   Asana → profile photo → Settings → Apps → Developer apps → Personal access tokens.
 *
 * Usage:
 *   ASANA_PAT=... npx tsx tools/import-asana.ts \
 *     --asana "Sandlake Home" --project "Chez Nous Chalet Self-Hosting" --user you@example.com --dry-run
 *   (drop --dry-run to write)
 *
 * Options:
 *   --asana <gid|name>      Asana project (gid, or exact name, case-insensitive)
 *   --project <id|name>     Existing Back Office project to import into
 *   --user <email>          Back Office user running the import (becomes project owner if none)
 *   --completed all|none|<N>d   Completed tasks to include (default: all)
 *   --no-attachments        Skip copying attachments
 *   --dry-run               Report only; writes nothing
 *
 * Safe to re-run: every section/task/comment/attachment/field is matched on its Asana gid.
 * People are matched to Back Office users by email. Unknown assignees/followers/project members
 * become GUEST users (no invite email — send from Share → Resend invite when ready).
 * Comment authors without an account keep their name on the comment.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';

if (!process.env.DATABASE_URL) dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, TaskCustomFieldType } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as fs from 'fs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// ── Args ─────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const ASANA_REF = arg('asana');
const PROJECT_REF = arg('project');
const USER_EMAIL = arg('user');
const COMPLETED = arg('completed') ?? 'all';
const DRY_RUN = flag('dry-run');
const WITH_ATTACHMENTS = !flag('no-attachments');
const PAT = process.env.ASANA_PAT?.trim();

if (!ASANA_REF || !PROJECT_REF || !USER_EMAIL || !PAT) {
  console.error('Usage: ASANA_PAT=... npx tsx tools/import-asana.ts --asana <gid|name> --project <id|name> --user <email> [--completed all|none|90d] [--no-attachments] [--dry-run]');
  process.exit(1);
}

// ── Asana client (throttled, 429-aware) ──────────────────────────────────────

const ASANA = 'https://app.asana.com/api/1.0';
let lastCall = 0;
let apiCalls = 0;

async function asana<T>(pathAndQuery: string): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastCall + 350 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    apiCalls++;
    const res = await fetch(`${ASANA}${pathAndQuery}`, { headers: { Authorization: `Bearer ${PAT}` } });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '30');
      console.log(`  …Asana rate limit, waiting ${retry}s`);
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Asana ${res.status} on ${pathAndQuery}: ${await res.text()}`);
    return (await res.json()) as T;
  }
  throw new Error(`Asana: gave up after retries on ${pathAndQuery}`);
}

async function asanaAll<T>(pathAndQuery: string): Promise<T[]> {
  const out: T[] = [];
  let offset: string | undefined;
  do {
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const page = await asana<{ data: T[]; next_page?: { offset: string } | null }>(
      `${pathAndQuery}${sep}limit=100${offset ? `&offset=${offset}` : ''}`,
    );
    out.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset);
  return out;
}

type AUser = { gid: string; name?: string; email?: string } | null;
type ACustomFieldValue = {
  gid: string;
  resource_subtype?: string;
  enum_value?: { gid: string } | null;
  multi_enum_values?: { gid: string }[];
  number_value?: number | null;
  text_value?: string | null;
  date_value?: { date: string } | null;
};
type ATask = {
  gid: string;
  name: string;
  notes?: string;
  html_notes?: string;
  completed: boolean;
  completed_at?: string | null;
  created_at: string;
  due_on?: string | null;
  due_at?: string | null;
  assignee?: AUser;
  followers?: AUser[];
  custom_fields?: ACustomFieldValue[];
  num_subtasks?: number;
  resource_subtype?: string;
};
type AStory = {
  gid: string;
  type: string;
  resource_subtype?: string;
  text?: string;
  html_text?: string;
  created_at: string;
  created_by?: AUser;
};
type AAttachment = {
  gid: string;
  name: string;
  host?: string;
  download_url?: string | null;
  view_url?: string | null;
  permanent_url?: string | null;
  size?: number | null;
  resource_subtype?: string;
};

const BASE_TASK_FIELDS = [
  'name', 'notes', 'html_notes', 'completed', 'completed_at', 'created_at', 'due_on', 'due_at',
  'assignee.name', 'assignee.email', 'followers.name', 'followers.email', 'num_subtasks', 'resource_subtype',
];
const CUSTOM_FIELD_FIELDS = [
  'custom_fields.gid', 'custom_fields.resource_subtype', 'custom_fields.enum_value.gid',
  'custom_fields.multi_enum_values.gid', 'custom_fields.number_value', 'custom_fields.text_value',
  'custom_fields.date_value.date',
];
// Custom fields are a paid Asana feature; dropped automatically on free workspaces.
let TASK_FIELDS = [...BASE_TASK_FIELDS, ...CUSTOM_FIELD_FIELDS].join(',');

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_STEP = 1024;
const norm = (e?: string | null) => (e ?? '').trim().toLowerCase();

/** Asana rich text (<body>…</body> with \n line breaks) → Quill-friendly HTML. */
export function asanaHtmlToQuill(html?: string | null, plain?: string | null): string | null {
  let s = (html ?? '').trim();
  if (!s) {
    const p = (plain ?? '').trim();
    if (!p) return null;
    s = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  s = s.replace(/^<body>/, '').replace(/<\/body>$/, '');
  // @mentions of people / tasks / projects → bold text
  s = s.replace(/<a [^>]*data-asana-type="user"[^>]*>(.*?)<\/a>/g, '<strong>$1</strong>');
  s = s.replace(/<a [^>]*data-asana-gid="[^"]*"[^>]*>(.*?)<\/a>/g, '$1');
  // Keep block elements; turn the remaining line breaks into paragraphs.
  const parts = s.split(/(<(?:ul|ol|pre|blockquote|h1|h2|h3)>[\s\S]*?<\/(?:ul|ol|pre|blockquote|h1|h2|h3)>|<hr\/?>)/);
  const out = parts
    .map((part) => {
      if (/^<(ul|ol|pre|blockquote|h1|h2|h3|hr)/.test(part)) return part.replace(/\n/g, '');
      return part
        .split('\n')
        .map((line) => (line.trim() ? `<p>${line}</p>` : ''))
        .join('');
    })
    .join('')
    .replace(/<p><\/p>/g, '');
  return out || null;
}

const ASANA_COLORS: Record<string, string> = {
  red: 'red', orange: 'orange', 'yellow-orange': 'orange', yellow: 'yellow', 'yellow-green': 'green',
  green: 'green', 'blue-green': 'teal', aqua: 'teal', blue: 'blue', indigo: 'purple', purple: 'purple',
  magenta: 'pink', 'hot-pink': 'pink', pink: 'pink', 'cool-gray': 'gray', none: 'gray',
};

function fieldType(subtype?: string): TaskCustomFieldType | null {
  switch (subtype) {
    case 'enum': return 'SINGLE_SELECT';
    case 'multi_enum': return 'MULTI_SELECT';
    case 'number': return 'NUMBER';
    case 'text': return 'TEXT';
    case 'date': return 'DATE';
    default: return null; // people, formula, etc. are skipped
  }
}

function fieldValue(type: TaskCustomFieldType, v: ACustomFieldValue): unknown {
  switch (type) {
    case 'SINGLE_SELECT': return v.enum_value?.gid ?? null;
    case 'MULTI_SELECT': return v.multi_enum_values?.length ? v.multi_enum_values.map((o) => o.gid) : null;
    case 'NUMBER': return v.number_value ?? null;
    case 'TEXT': return v.text_value?.trim() ? v.text_value : null;
    case 'DATE': return v.date_value?.date ?? null;
    default: return null;
  }
}

function splitName(name?: string): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0].includes('@'))) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
}

async function uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  if (process.env.STORAGE_PROVIDER === 's3') {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    const client = new S3Client({ region: process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-west-2' });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: mimeType }));
  } else {
    const full = path.join(process.cwd(), 'uploads', key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  }
}

function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
      '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as Record<string, string>
  )[ext] ?? 'application/octet-stream';
}

// ── Main ─────────────────────────────────────────────────────────────────────

type Collected = {
  task: ATask;
  parentGid: string | null;
  sectionGid: string | null;
  order: number;
  stories: AStory[];
  attachments: AAttachment[];
};

async function main() {
  console.log(`\n${DRY_RUN ? 'DRY RUN — nothing will be written' : 'IMPORT — writing to the database'}\n`);

  // Importer
  const importer = await prisma.user.findFirst({ where: { email: { equals: USER_EMAIL!, mode: 'insensitive' } } });
  if (!importer) throw new Error(`No Back Office user with email ${USER_EMAIL}`);

  // Back Office project
  const project =
    (await prisma.project.findUnique({ where: { id: PROJECT_REF! } })) ??
    (await prisma.project.findFirst({ where: { name: { equals: PROJECT_REF!, mode: 'insensitive' } } }));
  if (!project) throw new Error(`No Back Office project matching "${PROJECT_REF}" (create it on the Projects page first)`);

  // Asana project
  let asanaProject: { gid: string; name: string; members?: AUser[] } | null = null;
  if (/^\d+$/.test(ASANA_REF!)) {
    asanaProject = (await asana<{ data: { gid: string; name: string } }>(`/projects/${ASANA_REF}?opt_fields=name`)).data;
  } else {
    const me = await asana<{ data: { workspaces: { gid: string; name: string }[] } }>('/users/me?opt_fields=workspaces.name');
    for (const ws of me.data.workspaces) {
      const projects = await asanaAll<{ gid: string; name: string }>(`/projects?workspace=${ws.gid}&opt_fields=name`);
      const hit = projects.find((p) => p.name.trim().toLowerCase() === ASANA_REF!.trim().toLowerCase());
      if (hit) { asanaProject = hit; break; }
    }
  }
  if (!asanaProject) throw new Error(`No Asana project matching "${ASANA_REF}"`);
  const projectDetail = (await asana<{ data: { members: AUser[] } }>(`/projects/${asanaProject.gid}?opt_fields=members.name,members.email`)).data;
  console.log(`Asana "${asanaProject.name}" (${asanaProject.gid})  →  Back Office "${project.name}" (${project.id})`);

  // Sections
  const sections = await asanaAll<{ gid: string; name: string }>(`/projects/${asanaProject.gid}/sections?opt_fields=name`);

  // Custom fields
  type ASetting = { custom_field: { gid: string; name: string; resource_subtype: string; enum_options?: { gid: string; name: string; color?: string; enabled?: boolean }[] } };
  let settings: ASetting[] = [];
  try {
    settings = await asanaAll<ASetting>(
      `/projects/${asanaProject.gid}/custom_field_settings?opt_fields=custom_field.name,custom_field.resource_subtype,custom_field.enum_options.name,custom_field.enum_options.color,custom_field.enum_options.enabled`,
    );
  } catch (err) {
    if (!String(err).includes('Asana 402')) throw err;
    console.log('Custom fields: not available on this Asana plan — skipping');
    TASK_FIELDS = BASE_TASK_FIELDS.join(',');
  }
  const fields = settings
    .map((s) => s.custom_field)
    .map((f) => ({ ...f, type: fieldType(f.resource_subtype) }));

  // Tasks, by section in Asana order, plus subtasks / comments / attachments
  const completedParam =
    COMPLETED === 'none' ? '&completed_since=now'
    : /^\d+d$/.test(COMPLETED) ? `&completed_since=${new Date(Date.now() - parseInt(COMPLETED, 10) * 86400000).toISOString()}`
    : '';
  const collected: Collected[] = [];
  const seen = new Set<string>();

  async function collectTask(task: ATask, parentGid: string | null, sectionGid: string | null, order: number) {
    if (seen.has(task.gid)) return;
    seen.add(task.gid);
    const stories = await asanaAll<AStory>(`/tasks/${task.gid}/stories?opt_fields=type,resource_subtype,text,html_text,created_at,created_by.name,created_by.email`);
    const attachments = WITH_ATTACHMENTS
      ? await asanaAll<AAttachment>(`/tasks/${task.gid}/attachments?opt_fields=name,host,download_url,view_url,permanent_url,size,resource_subtype`)
      : [];
    collected.push({ task, parentGid, sectionGid, order, stories, attachments });
    if (task.num_subtasks) {
      const subs = await asanaAll<ATask>(`/tasks/${task.gid}/subtasks?opt_fields=${TASK_FIELDS}`);
      let i = 0;
      for (const sub of subs) await collectTask(sub, task.gid, null, ++i);
    }
  }

  for (const section of sections) {
    const tasks = await asanaAll<ATask>(`/tasks?section=${section.gid}&opt_fields=${TASK_FIELDS}${completedParam}`);
    process.stdout.write(`  Reading “${section.name}”: ${tasks.length} tasks…`);
    let i = 0;
    for (const t of tasks) {
      if (t.resource_subtype === 'section') continue;
      await collectTask(t, null, section.gid, ++i);
    }
    process.stdout.write(' done\n');
  }

  // People
  type PersonRef = { email: string; name?: string; roles: Set<string> };
  const people = new Map<string, PersonRef>();
  const note = (u: AUser | undefined, role: string) => {
    const email = norm(u?.email);
    if (!email) return;
    const p = people.get(email) ?? { email, name: u?.name, roles: new Set<string>() };
    p.roles.add(role);
    people.set(email, p);
  };
  for (const m of projectDetail.members ?? []) note(m, 'member');
  for (const c of collected) {
    note(c.task.assignee ?? null, 'assignee');
    for (const f of c.task.followers ?? []) note(f, 'follower');
    for (const s of c.stories) if (s.type === 'comment') note(s.created_by ?? null, 'commenter');
  }
  const existingUsers = await prisma.user.findMany({
    where: { OR: [...people.keys()].map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })) },
    select: { id: true, email: true, role: true, firstName: true, lastName: true },
  });
  const userByEmail = new Map(existingUsers.map((u) => [norm(u.email), u]));
  const toCreate = [...people.values()].filter(
    (p) => !userByEmail.has(p.email) && (p.roles.has('assignee') || p.roles.has('follower') || p.roles.has('member')),
  );
  const nameOnly = [...people.values()].filter((p) => !userByEmail.has(p.email) && !toCreate.includes(p));
  const clientConflicts = existingUsers.filter((u) => u.role === 'CLIENT');

  // Existing Back Office state for this project
  const existingSections = await prisma.taskSection.findMany({ where: { projectId: project.id }, include: { _count: { select: { tasks: true } } } });
  const emptyDefaults = existingSections.filter((s) => !s.importedAsanaGid && s._count.tasks === 0);
  const alreadyImported = await prisma.task.count({ where: { projectId: project.id, importedAsanaGid: { not: null } } });

  // ── Report ────────────────────────────────────────────────────────────────
  const top = collected.filter((c) => !c.parentGid);
  const subs = collected.filter((c) => c.parentGid);
  const comments = collected.reduce((n, c) => n + c.stories.filter((s) => s.type === 'comment').length, 0);
  const attachments = collected.reduce((n, c) => n + c.attachments.length, 0);
  const asanaFiles = collected.reduce((n, c) => n + c.attachments.filter((a) => a.host === 'asana' && a.download_url).length, 0);
  console.log('\nSections:');
  for (const s of sections) {
    const inSec = top.filter((c) => c.sectionGid === s.gid);
    console.log(`  - ${s.name}: ${inSec.length} tasks (${inSec.filter((c) => !c.task.completed).length} open)`);
  }
  console.log(`\nTasks: ${top.length} (${top.filter((c) => !c.task.completed).length} open, ${top.filter((c) => c.task.completed).length} completed)  [completed filter: ${COMPLETED}]`);
  console.log(`Subtasks: ${subs.length}`);
  console.log(`Comments: ${comments}`);
  console.log(`Attachments: ${attachments} (${asanaFiles} files copied to storage, ${attachments - asanaFiles} kept as links)`);
  console.log(`Custom fields: ${fields.filter((f) => f.type).map((f) => `${f.name} (${f.type})`).join(', ') || 'none'}`);
  const skippedFields = fields.filter((f) => !f.type);
  if (skippedFields.length) console.log(`  Skipped field types: ${skippedFields.map((f) => `${f.name} (${f.resource_subtype})`).join(', ')}`);
  console.log('\nPeople:');
  for (const p of people.values()) {
    const u = userByEmail.get(p.email);
    const status = u ? `existing ${u.role}` : toCreate.includes(p) ? 'NEW GUEST (no invite sent)' : 'name only (comments)';
    console.log(`  - ${p.name ?? ''} <${p.email}>  [${[...p.roles].join(', ')}]  → ${status}`);
  }
  if (clientConflicts.length) console.log(`  ! Client-portal users can't be on Tasks and will be left unassigned: ${clientConflicts.map((u) => u.email).join(', ')}`);
  if (emptyDefaults.length) console.log(`\nEmpty Back Office sections to remove: ${emptyDefaults.map((s) => s.name).join(', ')}`);
  if (alreadyImported) console.log(`\nNote: ${alreadyImported} tasks were already imported into this project — they will be updated, not duplicated.`);
  console.log(`\nAsana API calls: ${apiCalls}`);

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to import.');
    return;
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  console.log('\nWriting…');

  // People
  for (const p of toCreate) {
    const { firstName, lastName } = splitName(p.name);
    const u = await prisma.user.create({ data: { email: p.email, role: 'GUEST', firstName, lastName }, select: { id: true, email: true, role: true, firstName: true, lastName: true } });
    userByEmail.set(p.email, u);
  }
  const userId = (u?: AUser | null): string | null => {
    const found = userByEmail.get(norm(u?.email));
    return found && found.role !== 'CLIENT' ? found.id : null;
  };

  // Project in Tasks + members
  await prisma.project.update({ where: { id: project.id }, data: { inTaskManager: true, importedAsanaGid: project.importedAsanaGid ?? asanaProject.gid } });
  const memberIds = new Set<string>([importer.id]);
  for (const m of projectDetail.members ?? []) {
    const id = userId(m);
    if (id) memberIds.add(id);
  }
  for (const c of collected) {
    const a = userId(c.task.assignee ?? null);
    if (a) memberIds.add(a);
    for (const f of c.task.followers ?? []) {
      const id = userId(f);
      if (id) memberIds.add(id);
    }
  }
  const staff = new Set(existingUsers.filter((u) => u.role === 'ADMIN' || u.role === 'MEMBER').map((u) => u.id));
  for (const id of memberIds) {
    if (staff.has(id) && id !== importer.id) continue; // staff see every project anyway
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: id } },
      create: { projectId: project.id, userId: id, role: id === importer.id ? 'OWNER' : 'EDITOR' },
      update: {},
    });
  }

  // Remove empty default sections
  if (emptyDefaults.length) await prisma.taskSection.deleteMany({ where: { id: { in: emptyDefaults.map((s) => s.id) } } });

  // Sections
  const sectionId = new Map<string, string>();
  for (const [i, s] of sections.entries()) {
    const row = await prisma.taskSection.upsert({
      where: { importedAsanaGid: s.gid },
      create: { projectId: project.id, name: s.name, sortOrder: (i + 1) * ORDER_STEP, importedAsanaGid: s.gid },
      update: { name: s.name, sortOrder: (i + 1) * ORDER_STEP, projectId: project.id },
    });
    sectionId.set(s.gid, row.id);
  }

  // Custom fields
  const fieldId = new Map<string, { id: string; type: TaskCustomFieldType }>();
  for (const [i, f] of fields.entries()) {
    if (!f.type) continue;
    const options = (f.enum_options ?? [])
      .filter((o) => o.enabled !== false)
      .map((o) => ({ id: o.gid, label: o.name, color: ASANA_COLORS[o.color ?? 'none'] ?? 'gray' }));
    const data = {
      name: f.name,
      type: f.type,
      options: options.length ? (options as Prisma.InputJsonValue) : Prisma.JsonNull,
      sortOrder: (i + 1) * ORDER_STEP,
    };
    const row = await prisma.taskCustomField.upsert({
      where: { projectId_importedAsanaGid: { projectId: project.id, importedAsanaGid: f.gid } },
      create: { projectId: project.id, importedAsanaGid: f.gid, ...data },
      update: data,
    });
    fieldId.set(f.gid, { id: row.id, type: f.type });
  }

  // Tasks (parents first — collected order guarantees that)
  const taskId = new Map<string, string>();
  let done = 0;
  for (const c of collected) {
    const t = c.task;
    const data = {
      projectId: project.id,
      sectionId: c.parentGid ? null : (c.sectionGid ? sectionId.get(c.sectionGid) ?? null : null),
      parentTaskId: c.parentGid ? taskId.get(c.parentGid) ?? null : null,
      name: t.name?.trim() || 'Untitled task',
      description: asanaHtmlToQuill(t.html_notes, t.notes),
      assigneeId: userId(t.assignee ?? null),
      dueOn: t.due_on ? new Date(`${t.due_on}T00:00:00.000Z`) : null,
      dueAt: t.due_at ? new Date(t.due_at) : null,
      isCompleted: t.completed,
      completedAt: t.completed && t.completed_at ? new Date(t.completed_at) : null,
      sortOrder: c.order * ORDER_STEP,
    };
    const row = await prisma.task.upsert({
      where: { importedAsanaGid: t.gid },
      create: { ...data, importedAsanaGid: t.gid, createdById: importer.id, createdAt: new Date(t.created_at) },
      update: data,
    });
    taskId.set(t.gid, row.id);

    // Field values
    for (const v of t.custom_fields ?? []) {
      const f = fieldId.get(v.gid);
      if (!f) continue;
      const value = fieldValue(f.type, v);
      if (value === null) {
        await prisma.taskCustomFieldValue.deleteMany({ where: { taskId: row.id, fieldId: f.id } });
      } else {
        await prisma.taskCustomFieldValue.upsert({
          where: { taskId_fieldId: { taskId: row.id, fieldId: f.id } },
          create: { taskId: row.id, fieldId: f.id, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        });
      }
    }

    // Followers
    const followerIds = [...new Set((t.followers ?? []).map((f) => userId(f)).filter((id): id is string => !!id))];
    if (followerIds.length) {
      await prisma.taskFollower.createMany({ data: followerIds.map((uid) => ({ taskId: row.id, userId: uid })), skipDuplicates: true });
    }

    // Comments (with original author + date)
    for (const s of c.stories) {
      if (s.type !== 'comment') continue;
      const body = asanaHtmlToQuill(s.html_text, s.text);
      if (!body) continue;
      const authorId = userId(s.created_by ?? null);
      await prisma.taskComment.upsert({
        where: { importedAsanaGid: s.gid },
        create: {
          taskId: row.id,
          kind: 'COMMENT',
          body,
          authorId,
          authorLabel: authorId ? null : s.created_by?.name ?? 'Asana user',
          createdAt: new Date(s.created_at),
          importedAsanaGid: s.gid,
        },
        update: { taskId: row.id, body },
      });
    }

    // Attachments: Asana-hosted files are copied (download links expire); others kept as links.
    for (const a of c.attachments) {
      const exists = await prisma.taskAttachment.findUnique({ where: { importedAsanaGid: a.gid } });
      if (exists) continue;
      let fileUrl: string | null = null;
      let url: string | null = a.permanent_url ?? a.view_url ?? null;
      let size: number | null = a.size ?? null;
      let mime: string | null = null;
      if (a.host === 'asana' && a.download_url) {
        try {
          const res = await fetch(a.download_url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          mime = res.headers.get('content-type') || guessMime(a.name);
          const prefix = project.clientId ? `clients/${project.clientId}/projects/${project.id}` : `projects/${project.id}`;
          fileUrl = `${prefix}/tasks/${row.id}/${randomUUID()}${path.extname(a.name)}`;
          await uploadFile(fileUrl, buffer, mime);
          url = null;
          size = buffer.length;
        } catch (err) {
          console.log(`  ! Could not copy attachment "${a.name}" (${err instanceof Error ? err.message : err}); keeping link`);
          fileUrl = null;
        }
      }
      if (!fileUrl && !url) continue;
      await prisma.taskAttachment.create({
        data: { taskId: row.id, fileName: a.name, fileUrl, url, fileSize: size, mimeType: mime, uploadedById: importer.id, importedAsanaGid: a.gid },
      });
    }

    done++;
    if (done % 25 === 0) console.log(`  ${done}/${collected.length} tasks written`);
  }

  console.log(`\nDone. ${collected.length} tasks/subtasks imported into "${project.name}".`);
  if (toCreate.length) console.log(`Created ${toCreate.length} guest(s) without invites: ${toCreate.map((p) => p.email).join(', ')} — send invites from Share when ready.`);
}

main()
  .catch((err) => {
    console.error('\nImport failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
