import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real PrismaService opens a database connection on import; the service only needs its type.
vi.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

import { CommunicationsIngestService } from './communications-ingest.service';

const fixture = (name: string) => readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const TENANT = 'default';
const RECIPIENTS = ['tpn@in.example.test'];

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the Prisma calls the ingest service makes. */
function makeHarness(opts: { leads?: Row[]; knownContacts?: Array<{ email: string; clientIds: string[] }> } = {}) {
  const db = {
    contacts: [] as Row[],
    contactEmails: [] as Row[],
    links: [] as Row[],
    interactions: [] as Row[],
    captures: [] as Row[],
    verifications: [] as Row[],
    leads: opts.leads ?? [],
    leadUpdates: [] as Row[],
    uploads: [] as string[],
  };
  let seq = 0;
  const nextId = (p: string) => `${p}${++seq}`;
  const dup = () => Object.assign(new Error('unique'), { code: 'P2002' });

  for (const k of opts.knownContacts ?? []) {
    const id = nextId('known-');
    db.contacts.push({ id, tenantId: TENANT });
    db.contactEmails.push({ tenantId: TENANT, email: k.email, contactId: id });
    k.clientIds.forEach((clientId) => db.links.push({ contactId: id, clientId }));
  }

  const prisma = {
    user: {
      findMany: async () => [
        { id: 'u-lori', email: 'lori@example-tpn.test' },
        { id: 'u-judy', email: 'judy@example-tpn.test' },
      ],
    },
    forwardingVerification: { create: async ({ data }: Row) => (db.verifications.push(data), data) },
    interaction: {
      findUnique: async ({ where }: Row) =>
        db.interactions.find(
          (i) =>
            i.tenantId === where.tenantId_messageId.tenantId &&
            i.messageId === where.tenantId_messageId.messageId,
        ) ?? null,
      create: async ({ data }: Row) => {
        const id = nextId('int-');
        const { participants, captures, ...rest } = data;
        if (rest.messageId && db.interactions.some((i) => i.messageId === rest.messageId)) throw dup();
        db.interactions.push({ id, ...rest, participants: participants.create });
        db.captures.push({ interactionId: id, ...captures.create });
        return { id };
      },
    },
    interactionCapture: {
      create: async ({ data }: Row) => {
        if (db.captures.some((c) => c.interactionId === data.interactionId && c.capturedByEmail === data.capturedByEmail)) {
          throw dup();
        }
        db.captures.push(data);
        return data;
      },
    },
    contactEmail: {
      findMany: async ({ where }: Row) =>
        db.contactEmails
          .filter((ce) => ce.tenantId === where.tenantId && where.email.in.includes(ce.email))
          .map((ce) => ({
            email: ce.email,
            contactId: ce.contactId,
            contact: { accountLinks: db.links.filter((l) => l.contactId === ce.contactId).map((l) => ({ clientId: l.clientId })) },
          })),
      findUnique: async ({ where }: Row) =>
        db.contactEmails.find((ce) => ce.tenantId === where.tenantId_email.tenantId && ce.email === where.tenantId_email.email) ?? null,
    },
    contact: {
      create: async ({ data }: Row) => {
        const id = nextId('auto-');
        db.contacts.push({ id, tenantId: data.tenantId, firstName: data.firstName, lastName: data.lastName, autoCreated: data.autoCreated });
        db.contactEmails.push({ tenantId: data.tenantId, email: data.emails.create.email, contactId: id });
        return { id };
      },
      updateMany: async ({ where, data }: Row) => {
        let count = 0;
        for (const c of db.contacts.filter((c) => where.id.in.includes(c.id))) {
          if (!c.lastContactAt || c.lastContactAt < data.lastContactAt) { c.lastContactAt = data.lastContactAt; count++; }
        }
        return { count };
      },
    },
    lead: {
      findMany: async ({ where }: Row) => {
        const wanted: string[] = where.OR.map((o: Row) => o.email.equals);
        return db.leads.filter((l) => l.email && wanted.includes(l.email.toLowerCase())).map((l) => ({ id: l.id }));
      },
      updateMany: async ({ where, data }: Row) => (db.leadUpdates.push({ id: where.id, ...data }), { count: 1 }),
    },
  };

  const aliases = {
    resolve: async (a: string) =>
      a === 'tpn' ? { aliasId: 'alias-1', alias: 'tpn', tenantId: TENANT, tenantName: 'Test' } : null,
  };
  const storage = { upload: async ({ key }: Row) => (db.uploads.push(key), key) };
  const service = new CommunicationsIngestService(prisma as never, aliases as never, {} as never, storage as never);
  return { db, service };
}

beforeEach(() => {
  process.env.INBOUND_EMAIL_DOMAIN = 'in.example.test';
  delete process.env.INTERNAL_EMAIL_DOMAINS;
});

describe('CommunicationsIngestService', () => {
  it('files an inbound reply from a known contact to their client', async () => {
    const { db, service } = makeHarness({ knownContacts: [{ email: 'sally@familyclient.test', clientIds: ['client-A'] }] });
    const res = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('client-reply-forwarded.eml')) });

    expect(res).toMatchObject({ status: 'created', filing: 'FILED', clientId: 'client-A', reason: 'single-client', contactsCreated: 0 });
    const i = db.interactions[0];
    expect(i).toMatchObject({
      tenantId: TENANT, type: 'EMAIL', direction: 'INBOUND', source: 'FORWARD', status: 'FILED',
      clientId: 'client-A', loggedByUserId: 'u-lori', messageId: 'reply-1@familyclient.test',
      threadKey: 'mid:orig-1@example-tpn.test',
    });
    expect(i.participants.map((p: Row) => `${p.role}:${p.email}`)).toEqual([
      'FROM:sally@familyclient.test', 'TO:lori@example-tpn.test',
    ]);
    expect(i.participants.find((p: Row) => p.email === 'lori@example-tpn.test').userId).toBe('u-lori');
    expect(db.captures).toEqual([expect.objectContaining({ capturedByEmail: 'lori@example-tpn.test', userId: 'u-lori' })]);
    expect(db.uploads).toHaveLength(1); // raw message kept
  });

  it('puts mail from an unknown sender in Unfiled and auto-creates the contact', async () => {
    const { db, service } = makeHarness();
    const res = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('client-reply-forwarded.eml')) });

    expect(res).toMatchObject({ status: 'created', filing: 'UNFILED', reason: 'no-match', contactsCreated: 1 });
    expect(db.contacts[0]).toMatchObject({ firstName: 'Sally', lastName: 'Marlow', autoCreated: true });
    expect(db.interactions[0].participants.find((p: Row) => p.role === 'FROM').contactId).toBe(db.contacts[0].id);
    expect(db.contacts[0].lastContactAt?.toISOString()).toBe('2026-10-13T22:04:00.000Z');
  });

  it('records team-sent mail captured by BCC as OUTBOUND from the sender', async () => {
    const { db, service } = makeHarness({ knownContacts: [{ email: 'sally@familyclient.test', clientIds: ['client-A'] }] });
    await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('outbound-bcc.eml')) });
    expect(db.interactions[0]).toMatchObject({ direction: 'OUTBOUND', source: 'BCC', status: 'FILED', loggedByUserId: 'u-lori' });
  });

  it('stores one interaction when two partners forward the same message', async () => {
    const { db, service } = makeHarness();
    const first = fixture('client-reply-forwarded.eml');
    const second = first.replace('X-Forwarded-For: lori@example-tpn.test', 'X-Forwarded-For: judy@example-tpn.test');

    const a = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(first) });
    const b = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(second) });
    const again = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(second) });

    expect(a.status).toBe('created');
    expect(b).toMatchObject({ status: 'duplicate', interactionId: a.interactionId });
    expect(again.status).toBe('duplicate');
    expect(db.interactions).toHaveLength(1);
    expect(db.captures.map((c) => c.capturedByEmail).sort()).toEqual(['judy@example-tpn.test', 'lori@example-tpn.test']);
  });

  it('files to a lead when the sender is a known lead and no client matches', async () => {
    const { db, service } = makeHarness({ leads: [{ id: 'lead-1', email: 'Sally@FamilyClient.test' }] });
    const res = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('client-reply-forwarded.eml')) });
    expect(res).toMatchObject({ filing: 'FILED', leadId: 'lead-1', reason: 'lead-match' });
    expect(db.leadUpdates[0]).toMatchObject({ id: 'lead-1' });
    expect(db.leadUpdates[0].lastContactDate.toISOString()).toBe('2026-10-13T22:04:00.000Z');
  });

  it('drops partner-to-partner mail', async () => {
    const { db, service } = makeHarness();
    const res = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('internal-only.eml')) });
    expect(res.status).toBe('dropped_internal_only');
    expect(db.interactions).toHaveLength(0);
    expect(db.contacts).toHaveLength(0);
  });

  it('stores Gmail forwarding confirmations instead of filing them', async () => {
    const { db, service } = makeHarness();
    const res = await service.ingest({ recipients: RECIPIENTS, rawBase64: b64(fixture('gmail-forwarding-confirmation.eml')) });
    expect(res.status).toBe('forwarding_verification');
    expect(db.verifications).toEqual([
      { aliasId: 'alias-1', gmailAddress: 'lori@example-tpn.test', code: '482913', link: 'https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc123' },
    ]);
    expect(db.interactions).toHaveLength(0);
  });

  it('drops mail for an unknown or missing alias', async () => {
    const { service } = makeHarness();
    const raw = b64(fixture('client-reply-forwarded.eml'));
    expect((await service.ingest({ recipients: ['nobody@in.example.test'], rawBase64: raw })).status).toBe('dropped_unknown_alias');
    expect((await service.ingest({ recipients: ['x@other.test'], rawBase64: raw })).status).toBe('dropped_no_alias');
  });

  it('requires rawBase64 or s3Key', async () => {
    const { service } = makeHarness();
    await expect(service.ingest({ recipients: RECIPIENTS })).rejects.toThrow(/rawBase64 or s3Key/);
  });
});
