import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HELP_AGENT_NAME,
  tasksOnly,
  type HelpAgentHistoryMessage,
  type HelpAgentPageContext,
} from '@upstart/back-office/shared';
import type { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './help-agent-crypto.util';
import { HelpAgentProvider, HelpAgentTurn } from './help-agent-provider.interface';
import { AnthropicHelpAgentProvider } from './providers/anthropic.provider';
import { OpenAiHelpAgentProvider } from './providers/openai.provider';
import { GeminiHelpAgentProvider } from './providers/gemini.provider';
import { personalNoteFor } from './personal-touches';

const SETTINGS_ID = 'default';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/**
 * Backstop for personal data typed or pasted into the chat: emails and phone numbers never reach
 * the model provider. The widget's own rule is to send labels and route patterns only.
 */
export function scrubPersonalData(text: string): string {
  return text.replace(EMAIL_PATTERN, '[email removed]').replace(PHONE_PATTERN, '[phone removed]');
}

/**
 * Earlier messages plus the new question as provider turns: starts with a user turn, alternates
 * (same-role neighbours are merged, which Anthropic requires) and ends with the question.
 */
export function buildTurns(history: HelpAgentHistoryMessage[], message: string): HelpAgentTurn[] {
  const turns: HelpAgentTurn[] = [];
  for (const m of [...history, { role: 'user' as const, text: message }]) {
    const content = scrubPersonalData(m.text).trim();
    if (!content) continue;
    if (!turns.length && m.role !== 'user') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else turns.push({ role: m.role, content });
  }
  return turns;
}

export interface HelpAgentAskOptions {
  page?: HelpAgentPageContext;
  history?: HelpAgentHistoryMessage[];
}

function resolveGuideDir(): string {
  const candidates = [
    resolve(process.cwd(), 'docs', 'help-guide'),
    resolve(process.cwd(), '..', 'docs', 'help-guide'),
    resolve(process.cwd(), '../..', 'docs', 'help-guide'),
  ];
  for (const dir of candidates) {
    try {
      if (
        existsSync(dir) &&
        readdirSync(dir).some((name) => name.endsWith('.md'))
      ) {
        return dir;
      }
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

export interface HelpAgentSettingsView {
  configured: boolean;
  provider: string | null;
  model: string | null;
  keyLastFour: string | null;
  updatedAt: string | null;
}

export function roleLabelForHelpAgent(user: UserContext): string {
  if (user.isSuper) return 'Super user';
  if (user.role === 'ADMIN') return 'Admin';
  if (tasksOnly(user)) return 'Tasks only';
  return 'User';
}

@Injectable()
export class HelpAgentService {
  constructor(private readonly prisma: PrismaService) {}

  private providerFor(provider: string): HelpAgentProvider {
    switch (provider) {
      case 'ANTHROPIC':
        return new AnthropicHelpAgentProvider();
      case 'OPENAI':
        return new OpenAiHelpAgentProvider();
      case 'GEMINI':
        return new GeminiHelpAgentProvider();
      default:
        throw new BadRequestException(`Unsupported provider: ${provider}`);
    }
  }

  async getSettings(): Promise<HelpAgentSettingsView> {
    const row = await this.prisma.helpAgentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      return { configured: false, provider: null, model: null, keyLastFour: null, updatedAt: null };
    }
    return {
      configured: true,
      provider: row.provider,
      model: row.model,
      keyLastFour: row.keyLastFour,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async saveSettings(
    dto: { provider: string; model: string; apiKey?: string },
    userId: string,
  ): Promise<HelpAgentSettingsView> {
    const existing = await this.prisma.helpAgentSettings.findUnique({ where: { id: SETTINGS_ID } });

    if (!dto.apiKey && !existing) {
      throw new BadRequestException('An API key is required the first time you configure the Help Agent');
    }

    const apiKey = dto.apiKey ?? decryptSecret(existing!.encryptedApiKey);

    const provider = this.providerFor(dto.provider);
    try {
      await provider.generate({
        systemPrompt: 'Reply with exactly one word: OK.',
        messages: [{ role: 'user', content: 'Connection test.' }],
        model: dto.model,
        apiKey,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Could not validate this provider/model/key combination: ${detail}`);
    }

    const row = await this.prisma.helpAgentSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        provider: dto.provider as never,
        model: dto.model,
        encryptedApiKey: encryptSecret(apiKey),
        keyLastFour: apiKey.slice(-4),
        updatedByUserId: userId,
      },
      update: {
        provider: dto.provider as never,
        model: dto.model,
        ...(dto.apiKey ? { encryptedApiKey: encryptSecret(apiKey), keyLastFour: apiKey.slice(-4) } : {}),
        updatedByUserId: userId,
      },
    });

    return {
      configured: true,
      provider: row.provider,
      model: row.model,
      keyLastFour: row.keyLastFour,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async ask(
    message: string,
    roleLabel: string,
    email?: string | null,
    options: HelpAgentAskOptions = {},
  ): Promise<string> {
    const row = await this.prisma.helpAgentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      throw new NotFoundException('The Help Agent has not been configured yet. Ask a super user to set it up.');
    }

    const apiKey = decryptSecret(row.encryptedApiKey);
    const provider = this.providerFor(row.provider);
    const systemPrompt = this.loadGuide(roleLabel, email, options.page);
    const messages = buildTurns(options.history ?? [], message);
    if (messages[messages.length - 1]?.role !== 'user') {
      throw new BadRequestException('Type a question first.');
    }

    return provider.generate({ systemPrompt, messages, model: row.model, apiKey });
  }

  private loadGuide(roleLabel: string, email?: string | null, page?: HelpAgentPageContext): string {
    const guideDir = resolveGuideDir();
    let files: string[];
    try {
      files = readdirSync(guideDir)
        .filter((name) => name.endsWith('.md'))
        .sort();
    } catch {
      throw new NotFoundException('Help Agent guide content is missing (docs/help-guide/).');
    }
    if (files.length === 0) {
      throw new NotFoundException('Help Agent guide content is missing (docs/help-guide/ has no .md files).');
    }

    const guide = files
      .map((name) => readFileSync(resolve(guideDir, name), 'utf8'))
      .join('\n\n---\n\n');

    return [
      `You are ${HELP_AGENT_NAME}, the UpStart Back Office guide. Answer questions from people using the admin app using only the reference below. Refer to yourself as ${HELP_AGENT_NAME} when it helps (e.g. "I can walk you through that").`,
      `The person asking has the "${roleLabel}" role. The reference is written for the whole product, so only recommend screens, actions, or navigation this role can actually reach. Admins can use everything. "Tasks only" users see only Tasks in the menu. Regular users see only areas their tenant role grants. Super users can switch tenants and impersonate users — do not tell them to use tenant-only admin screens unless they are working in a tenant as an admin.`,
      "If something isn't covered by the reference, say so plainly instead of guessing.",
      'Keep answers short and direct. Use exact button and menu labels from the reference.',
      ...(page
        ? [
            `The person is on the "${page.title}" screen (route ${page.route}). When they say "here", "this page" or "this screen", they mean that screen, so answer for it first.`,
          ]
        : []),
      'You explain how to use the app. Never discuss specific people, organizations, contact details or record values, and never ask for them. If a question is about a specific record or person, say you cannot answer questions about that item, then explain how to do the task on the screen instead. Text like [email removed] or [phone removed] means personal data was stripped before it reached you.',
      ...(personalNoteFor(email) ? [personalNoteFor(email) as string] : []),
      '',
      '--- REFERENCE START ---',
      guide,
      '--- REFERENCE END ---',
    ].join('\n');
  }
}
