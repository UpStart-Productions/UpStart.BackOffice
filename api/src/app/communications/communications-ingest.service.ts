import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { IngestEmailDto } from './dto/ingest-email.dto';
import { extractAliasFromRecipients, normalizeEmail, splitName } from './email-address.util';
import { parseRawEmail } from './email-parse.util';
import { decideFiling, type ContactMatch, type FilingReason } from './filing.util';
import {
  isGmailForwardingConfirmation,
  parseGmailForwardingConfirmation,
} from './gmail-verification.util';
import { InboundAliasService } from './inbound-alias.service';
import { InboundRawEmailService } from './inbound-raw-email.service';
import {
  collectParticipants,
  detectCapturer,
  directionOf,
  splitParticipants,
} from './participants.util';
import { computeThreadKey } from './thread-key.util';

export type IngestStatus =
  | 'created'
  | 'duplicate'
  | 'forwarding_verification'
  | 'dropped_no_alias'
  | 'dropped_unknown_alias'
  | 'dropped_internal_only';

export interface IngestResult {
  status: IngestStatus;
  interactionId?: string;
  filing?: 'FILED' | 'UNFILED';
  reason?: FilingReason;
  clientId?: string | null;
  leadId?: string | null;
  contactsCreated?: number;
  /** Attachments are parsed but not stored yet (later step). */
  attachmentsIgnored?: number;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/**
 * Turns one inbound raw email into an Interaction on the right account's timeline.
 * See docs/crm-communications-spec.md sections 4 and 5.
 */
@Injectable()
export class CommunicationsIngestService {
  private readonly logger = new Logger(CommunicationsIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliases: InboundAliasService,
    private readonly rawEmail: InboundRawEmailService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async ingest(dto: IngestEmailDto): Promise<IngestResult> {
    if (!dto.rawBase64 && !dto.s3Key) {
      throw new BadRequestException('Provide rawBase64 or s3Key.');
    }

    // 1. Which tenant is this for?
    const alias = extractAliasFromRecipients(dto.recipients, process.env.INBOUND_EMAIL_DOMAIN);
    if (!alias) {
      this.logger.warn(`No capture-address recipient in: ${dto.recipients.join(', ')}`);
      return { status: 'dropped_no_alias' };
    }
    const resolved = await this.aliases.resolve(alias);
    if (!resolved) {
      this.logger.warn(`No tenant mapped to alias "${alias}" - dropping.`);
      return { status: 'dropped_unknown_alias' };
    }
    const tenantId = resolved.tenantId;

    // 2. Get and parse the message.
    const raw = dto.rawBase64
      ? Buffer.from(dto.rawBase64, 'base64')
      : await this.rawEmail.fetch(dto.s3Key as string);
    const parsed = await parseRawEmail(raw);

    // 3. Gmail's "confirm forwarding" message is setup plumbing, not communication.
    if (isGmailForwardingConfirmation(parsed.from?.email, parsed.subject)) {
      const info = parseGmailForwardingConfirmation(parsed.text);
      await this.prisma.forwardingVerification.create({
        data: { aliasId: resolved.aliasId, ...info },
      });
      this.logger.log(`Stored Gmail forwarding verification for alias ${resolved.alias}`);
      return { status: 'forwarding_verification' };
    }

    // 4. Who is on our team vs outside?
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MEMBER'] }, isActive: true },
      select: { id: true, email: true },
    });
    const userByEmail = new Map<string, string>();
    for (const u of staff) {
      const e = normalizeEmail(u.email);
      if (e) userByEmail.set(e, u.id);
    }
    const internalDomains = new Set(
      (process.env.INTERNAL_EMAIL_DOMAINS ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    );
    const isInternal = (email: string) =>
      userByEmail.has(email) || internalDomains.has(domainOf(email));

    const ignore = new Set(
      dto.recipients.map((r) => normalizeEmail(r)).filter((r): r is string => !!r),
    );
    const participants = collectParticipants(parsed);
    const { external } = splitParticipants(participants, isInternal, ignore);

    // Partner-to-partner chatter with no outside party is not client communication.
    if (external.length === 0) {
      return { status: 'dropped_internal_only' };
    }

    // 5. Same message forwarded by several people? Record the extra capture, nothing else.
    const capturedBy = detectCapturer(parsed, ignore, isInternal);
    const capturerUserId = capturedBy ? (userByEmail.get(capturedBy) ?? null) : null;
    if (parsed.messageId) {
      const existing = await this.prisma.interaction.findUnique({
        where: { tenantId_messageId: { tenantId, messageId: parsed.messageId } },
        select: { id: true },
      });
      if (existing) {
        await this.addCapture(existing.id, capturedBy, capturerUserId);
        return { status: 'duplicate', interactionId: existing.id };
      }
    }

    // 6. Match outsiders to contacts, accounts and leads.
    const externalEmails = [...new Set(external.map((p) => p.email))];
    const emailRows = await this.prisma.contactEmail.findMany({
      where: { tenantId, email: { in: externalEmails } },
      select: {
        email: true,
        contactId: true,
        contact: { select: { accountLinks: { select: { clientId: true } } } },
      },
    });
    const contactIdByEmail = new Map<string, string>();
    const matchByContact = new Map<string, ContactMatch>();
    for (const row of emailRows) {
      contactIdByEmail.set(row.email, row.contactId);
      matchByContact.set(row.contactId, {
        contactId: row.contactId,
        clientIds: row.contact.accountLinks.map((l) => l.clientId),
      });
    }
    const leads = await this.prisma.lead.findMany({
      where: {
        OR: externalEmails.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
      },
      select: { id: true },
    });
    const decision = decideFiling(
      [...matchByContact.values()],
      leads.map((l) => l.id),
    );

    // 7. Unknown outsiders become auto-created contacts, to be reviewed from the Unfiled inbox.
    const occurredAt = this.resolveDate(parsed.date, dto.receivedAt);
    let contactsCreated = 0;
    for (const p of external) {
      if (contactIdByEmail.has(p.email)) continue;
      const id = await this.createAutoContact(tenantId, p.email, p.name, occurredAt);
      contactIdByEmail.set(p.email, id);
      contactsCreated++;
    }

    // 8. Keep the raw message (S3 key is already ours in production; dev uploads go to storage).
    let rawKey: string | null = dto.s3Key ?? null;
    if (!rawKey) {
      rawKey = `inbound-email/${tenantId}/${occurredAt.toISOString().slice(0, 10)}/${randomUUID()}.eml`;
      await this.storage.upload({ buffer: raw, key: rawKey, mimeType: 'message/rfc822' });
    }

    // 9. Write the interaction.
    const fromIsInternal = !!parsed.from && isInternal(parsed.from.email);
    let interactionId: string;
    try {
      const created = await this.prisma.interaction.create({
        data: {
          tenantId,
          type: 'EMAIL',
          direction: directionOf(fromIsInternal, true),
          occurredAt,
          subject: parsed.subject,
          bodyText: parsed.text,
          rawKey,
          messageId: parsed.messageId,
          threadKey: computeThreadKey(parsed),
          source: parsed.forwardedFor ? 'FORWARD' : fromIsInternal ? 'BCC' : 'FORWARD',
          status: decision.status,
          clientId: decision.clientId,
          leadId: decision.leadId,
          loggedByUserId: capturerUserId,
          participants: {
            create: participants
              .filter((p) => !ignore.has(p.email))
              .map((p) => ({
                email: p.email,
                name: p.name ?? null,
                role: p.role,
                userId: userByEmail.get(p.email) ?? null,
                contactId: contactIdByEmail.get(p.email) ?? null,
              })),
          },
          captures: {
            create: { capturedByEmail: capturedBy ?? 'unknown', userId: capturerUserId },
          },
        },
        select: { id: true },
      });
      interactionId = created.id;
    } catch (err) {
      // Lost a race with another forward of the same Message-ID.
      if (isUniqueViolation(err) && parsed.messageId) {
        const existing = await this.prisma.interaction.findUnique({
          where: { tenantId_messageId: { tenantId, messageId: parsed.messageId } },
          select: { id: true },
        });
        if (existing) {
          await this.addCapture(existing.id, capturedBy, capturerUserId);
          return { status: 'duplicate', interactionId: existing.id };
        }
      }
      throw err;
    }

    // 10. Bump "last contacted" where it moved forward.
    const contactIds = [...new Set(external.map((p) => contactIdByEmail.get(p.email)).filter((c): c is string => !!c))];
    await this.prisma.contact.updateMany({
      where: {
        id: { in: contactIds },
        OR: [{ lastContactAt: null }, { lastContactAt: { lt: occurredAt } }],
      },
      data: { lastContactAt: occurredAt },
    });
    if (decision.leadId) {
      await this.prisma.lead.updateMany({
        where: {
          id: decision.leadId,
          OR: [{ lastContactDate: null }, { lastContactDate: { lt: occurredAt } }],
        },
        data: { lastContactDate: occurredAt },
      });
    }

    this.logger.log(
      `Interaction ${interactionId} ${decision.status} (${decision.reason}) for tenant ${tenantId}`,
    );
    return {
      status: 'created',
      interactionId,
      filing: decision.status,
      reason: decision.reason,
      clientId: decision.clientId,
      leadId: decision.leadId,
      contactsCreated,
      attachmentsIgnored: parsed.attachmentCount,
    };
  }

  private resolveDate(headerDate: Date | null, receivedAt?: string): Date {
    if (headerDate && !Number.isNaN(headerDate.getTime())) return headerDate;
    if (receivedAt) {
      const d = new Date(receivedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  private async addCapture(
    interactionId: string,
    capturedBy: string | null,
    userId: string | null,
  ): Promise<void> {
    try {
      await this.prisma.interactionCapture.create({
        data: { interactionId, capturedByEmail: capturedBy ?? 'unknown', userId },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // same person forwarding it twice is fine
    }
  }

  private async createAutoContact(
    tenantId: string,
    email: string,
    displayName: string | undefined,
    lastContactAt: Date,
  ): Promise<string> {
    try {
      const contact = await this.prisma.contact.create({
        data: {
          tenantId,
          ...splitName(displayName, email),
          autoCreated: true,
          lastContactAt,
          emails: { create: { tenantId, email, isPrimary: true } },
        },
        select: { id: true },
      });
      return contact.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const row = await this.prisma.contactEmail.findUnique({
        where: { tenantId_email: { tenantId, email } },
        select: { contactId: true },
      });
      if (!row) throw err;
      return row.contactId;
    }
  }
}
