import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Conversations are deleted this long after they were last used. */
export const HELP_AGENT_THREAD_KEEP_DAYS = 30;
/** Most messages kept per conversation (oldest drop off). */
const MAX_MESSAGES = 80;
/** Rough cap on a saved conversation, so one runaway chat can't bloat the table. */
const MAX_JSON_CHARS = 600_000;

export type HelpAgentThreadSummary = {
  id: string;
  title: string;
  recordType: string | null;
  recordId: string | null;
  updatedAt: string;
  messageCount: number;
};

/**
 * Saved JD conversations. Every query is the signed-in person's own (userId), inside their tenant
 * (the Prisma tenant extension). Nobody else, admins included, can read them.
 */
@Injectable()
export class HelpAgentThreadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<HelpAgentThreadSummary[]> {
    await this.purgeOld(userId);
    const rows = await this.prisma.helpAgentThread.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, title: true, recordType: true, recordId: true, updatedAt: true, messages: true },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      recordType: r.recordType,
      recordId: r.recordId,
      updatedAt: r.updatedAt.toISOString(),
      messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
    }));
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.helpAgentThread.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Conversation not found');
    return this.toDto(row);
  }

  /** The latest conversation tied to a record, or null. */
  async forRecord(userId: string, recordType: string, recordId: string) {
    const row = await this.prisma.helpAgentThread.findFirst({
      where: { userId, recordType, recordId },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? this.toDto(row) : null;
  }

  async create(userId: string, data: { title?: string; messages?: unknown[]; recordType?: string | null; recordId?: string | null }) {
    const row = await this.prisma.helpAgentThread.create({
      data: {
        userId,
        title: cleanTitle(data.title),
        messages: cleanMessages(data.messages),
        recordType: data.recordType || null,
        recordId: data.recordId || null,
      },
    });
    return this.toDto(row);
  }

  async update(userId: string, id: string, data: { title?: string; messages?: unknown[] }) {
    const existing = await this.prisma.helpAgentThread.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundException('Conversation not found');
    const row = await this.prisma.helpAgentThread.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: cleanTitle(data.title) } : {}),
        ...(data.messages !== undefined ? { messages: cleanMessages(data.messages) } : {}),
      },
    });
    return this.toDto(row);
  }

  async remove(userId: string, id: string) {
    await this.prisma.helpAgentThread.deleteMany({ where: { id, userId } });
    return { deleted: true };
  }

  /** Conversations untouched for 30 days go away. Runs when the list is read; no scheduler needed. */
  private async purgeOld(userId: string) {
    const cutoff = new Date(Date.now() - HELP_AGENT_THREAD_KEEP_DAYS * 86_400_000);
    await this.prisma.helpAgentThread.deleteMany({ where: { userId, updatedAt: { lt: cutoff } } });
  }

  private toDto(row: {
    id: string;
    title: string;
    messages: Prisma.JsonValue;
    recordType: string | null;
    recordId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      messages: Array.isArray(row.messages) ? row.messages : [],
      recordType: row.recordType,
      recordId: row.recordId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function cleanTitle(title?: string): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  return (t || 'New conversation').slice(0, 120);
}

/** Keep the newest messages, drop anything that isn't a chat message, and stay under the size cap. */
function cleanMessages(messages?: unknown[]): Prisma.InputJsonValue {
  const list = (Array.isArray(messages) ? messages : [])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && (m['role'] === 'user' || m['role'] === 'assistant') && typeof m['text'] === 'string')
    .slice(-MAX_MESSAGES);
  while (list.length > 1 && JSON.stringify(list).length > MAX_JSON_CHARS) list.shift();
  return list as Prisma.InputJsonValue;
}
