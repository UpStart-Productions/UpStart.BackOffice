import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  HELP_AGENT_NAME,
  normalizeHelpLabel,
  tasksOnly,
  type HelpAgentHistoryMessage,
  type HelpAgentPageContext,
  type HelpAgentTarget,
} from '@upstart/back-office/shared';
import { HELP_AGENT_UI_LABELS } from '@upstart/back-office/shared/help-labels';
import type { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './help-agent-crypto.util';
import { HelpAgentProvider, HelpAgentToolCallLog, HelpAgentTurn } from './help-agent-provider.interface';
import { AnthropicHelpAgentProvider } from './providers/anthropic.provider';
import { OpenAiHelpAgentProvider } from './providers/openai.provider';
import { GeminiHelpAgentProvider } from './providers/gemini.provider';
import { personalNoteFor } from './personal-touches';
import { tryTenantId } from '../tenancy/tenant-context';
import {
  HELP_AGENT_TOOL_LABELS,
  openHelpAgentMcpSession,
  type HelpAgentCaller,
  type HelpAgentMcpSession,
} from './help-agent-mcp.client';

/** Most record lookups for one question. */
const MAX_TOOL_CALLS = 6;

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
export function buildTurns(history: HelpAgentHistoryMessage[], message: string, scrub = true): HelpAgentTurn[] {
  const turns: HelpAgentTurn[] = [];
  for (const m of [...history, { role: 'user' as const, text: message }]) {
    const content = (scrub ? scrubPersonalData(m.text) : m.text).trim();
    if (!content) continue;
    if (!turns.length && m.role !== 'user') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else turns.push({ role: m.role, content });
  }
  return turns;
}

const KNOWN_LABELS = new Set(HELP_AGENT_UI_LABELS);

/** The label if it is a fixed UI label from the allowlist, otherwise undefined (never sent on). */
function knownLabel(text?: string): string | undefined {
  if (!text) return undefined;
  return KNOWN_LABELS.has(normalizeHelpLabel(text)) ? text.replace(/\s+/g, ' ').trim() : undefined;
}

/** Drops any panel or label that is not on the allowlist, as a backstop for the widget's own check. */
export function sanitizeTarget(target?: HelpAgentTarget): HelpAgentTarget | undefined {
  if (!target) return undefined;
  const panel = knownLabel(target.panel);
  const label = knownLabel(target.label);
  const withheld = target.withheld || (!!target.label && !label);
  if (!panel && !label && !target.icon && !target.helpKey && !withheld) return undefined;
  return {
    kind: target.kind,
    ...(panel ? { panel } : {}),
    ...(label ? { label } : {}),
    ...(target.icon ? { icon: target.icon } : {}),
    ...(target.helpKey ? { helpKey: target.helpKey } : {}),
    ...(withheld ? { withheld: true } : {}),
  };
}

const KIND_WORDS: Record<HelpAgentTarget['kind'], string> = {
  button: 'button',
  link: 'link',
  field: 'field',
  heading: 'heading',
  tab: 'tab',
  icon: 'icon',
  text: 'text',
  area: 'area',
};

/** Prompt line for what the person pointed at. */
export function describeTarget(t: HelpAgentTarget): string {
  const where = t.panel ? ` in the "${t.panel}" panel` : ' on this screen';
  if (t.withheld) {
    return `They highlighted something${where} that looks like record data, so it was not shared with you. Start your reply by saying you can't answer questions about that specific item, then help with ${t.panel ? `the "${t.panel}" panel` : 'this screen'}.`;
  }
  const parts = [
    t.label ? `the "${t.label}" ${KIND_WORDS[t.kind]}` : `a ${KIND_WORDS[t.kind]}`,
    t.icon ? ` (${t.icon} icon)` : '',
    where,
    t.helpKey ? ` (help key ${t.helpKey})` : '',
  ];
  return `They pointed at ${parts.join('')}. When they say "this" or "here", they mean that.`;
}

export interface HelpAgentAskOptions {
  page?: HelpAgentPageContext;
  history?: HelpAgentHistoryMessage[];
  target?: HelpAgentTarget;
  /** Who is asking, for record lookups through the MCP server and the usage log. */
  caller?: HelpAgentCaller & {
    userId?: string;
    /** A super user viewing the app as someone else. Lookups would run as the super user, so they're off. */
    impersonating?: boolean;
  };
}

export interface HelpAgentAnswer {
  answer: string;
  /** Plain-language names of what the guide looked up, e.g. ["invoices"]. Empty in guide-only mode. */
  lookups: string[];
}

/** Modes: guide only (help files, no record data) or reads records (tools through the MCP server). */
type HelpAgentMode =
  | { readsRecords: false; unavailable?: boolean; impersonating?: boolean }
  | { readsRecords: true; session: HelpAgentMcpSession };

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

/** Prompt rules when the guide can look up records with tools (as the person asking). */
function recordRules(): string[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Today is ${today}.`,
    'You can also look up this organization\'s records with your tools. Tools run as the person asking, with their permissions: if a tool says they lack access, tell them plainly. Never suggest ways around it.',
    'Use tools for questions about records, totals and counts ("how much have we invoiced X", "how many open tasks does Y have"). Use the reference for how-to questions.',
    'Answer with the numbers first, then a short breakdown if it helps. Never show record IDs.',
    'If a name matches several records, ask which one. Never guess or pick one yourself.',
    'You can only read records, not change them. If asked to create, update or send something, explain how to do it on the screen.',
  ];
}

/** Prompt rules when the guide only has the help files. */
function guideOnlyRules(flags: { unavailable?: boolean; impersonating?: boolean }): string[] {
  return [
    'You explain how to use the app. Never discuss specific people, organizations, contact details or record values, and never ask for them. If a question is about a specific record or person, say you cannot answer questions about that item, then explain how to do the task on the screen instead. Text like [email removed] or [phone removed] means personal data was stripped before it reached you.',
    ...(flags.unavailable
      ? ['Record lookups are switched on for this organization but unavailable right now. If asked about records, say lookups are down at the moment and to try again shortly.']
      : []),
    ...(flags.impersonating
      ? ['The person is impersonating another user, so record lookups are off. If asked about records, say lookups are off while impersonating.']
      : []),
  ];
}

@Injectable()
export class HelpAgentService {
  private readonly logger = new Logger(HelpAgentService.name);

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
  ): Promise<HelpAgentAnswer> {
    const row = await this.prisma.helpAgentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      throw new NotFoundException('The Help Agent has not been configured yet. Ask a super user to set it up.');
    }

    const apiKey = decryptSecret(row.encryptedApiKey);
    const provider = this.providerFor(row.provider);
    const mode = await this.openMode(provider, options.caller ?? {});
    try {
      const systemPrompt = this.loadGuide(roleLabel, email, options.page, sanitizeTarget(options.target), mode);
      // Guide-only mode strips emails and phone numbers; reading records needs the question as asked.
      const messages = buildTurns(options.history ?? [], message, !mode.readsRecords);
      if (messages[messages.length - 1]?.role !== 'user') {
        throw new BadRequestException('Type a question first.');
      }

      if (mode.readsRecords && provider.generateWithTools) {
        const run = await provider.generateWithTools({
          systemPrompt,
          messages,
          model: row.model,
          apiKey,
          tools: mode.session.tools,
          callTool: (name, args) => mode.session.call(name, args),
          maxToolCalls: MAX_TOOL_CALLS,
        });
        await this.logUsage(options.caller?.userId, row.model, true, run);
        const lookups = [...new Set(run.toolCalls.map((c) => HELP_AGENT_TOOL_LABELS[c.tool] ?? c.tool))];
        return { answer: run.text, lookups };
      }

      const answer = await provider.generate({ systemPrompt, messages, model: row.model, apiKey });
      await this.logUsage(options.caller?.userId, row.model, false, null);
      return { answer, lookups: [] };
    } finally {
      if (mode.readsRecords) await mode.session.close();
    }
  }

  /**
   * Reads records only when the provider supports tools, the tenant switched it on (Settings → Back Office
   * guide), and the MCP server answers. Otherwise guide-only, with a note if lookups are down.
   */
  private async openMode(
    provider: HelpAgentProvider,
    caller: NonNullable<HelpAgentAskOptions['caller']>,
  ): Promise<HelpAgentMode> {
    const tenantId = tryTenantId();
    if (!provider.generateWithTools || !tenantId) return { readsRecords: false };
    if (caller.impersonating) return { readsRecords: false, impersonating: true };
    const profile = await this.prisma.organizationProfile.findUnique({
      where: { tenantId },
      select: { guideReadsRecords: true },
    });
    if (!profile?.guideReadsRecords) return { readsRecords: false };
    try {
      return { readsRecords: true, session: await openHelpAgentMcpSession(caller) };
    } catch (err) {
      this.logger.warn(`Guide record lookups unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return { readsRecords: false, unavailable: true };
    }
  }

  /** One row per question: tokens, and which tools it called (names and arguments, never results). */
  private async logUsage(
    userId: string | undefined,
    model: string,
    readsRecords: boolean,
    run: { toolCalls: HelpAgentToolCallLog[]; inputTokens: number; outputTokens: number } | null,
  ): Promise<void> {
    if (!tryTenantId()) return;
    try {
      await this.prisma.helpAgentUsage.create({
        data: {
          userId: userId ?? null,
          model,
          readsRecords,
          toolCalls: (run?.toolCalls ?? []) as unknown as Prisma.InputJsonValue,
          inputTokens: run?.inputTokens ?? 0,
          outputTokens: run?.outputTokens ?? 0,
        },
      });
    } catch (err) {
      this.logger.warn(`Could not log guide usage: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private loadGuide(
    roleLabel: string,
    email?: string | null,
    page?: HelpAgentPageContext,
    target?: HelpAgentTarget,
    mode: HelpAgentMode = { readsRecords: false },
  ): string {
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

    const modeRuleLines = mode.readsRecords
      ? recordRules()
      : guideOnlyRules({
          unavailable: 'unavailable' in mode ? mode.unavailable : undefined,
          impersonating: 'impersonating' in mode ? mode.impersonating : undefined,
        });

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
      ...(target ? [describeTarget(target)] : []),
      ...modeRuleLines,
      ...(personalNoteFor(email) ? [personalNoteFor(email) as string] : []),
      '',
      '--- REFERENCE START ---',
      guide,
      '--- REFERENCE END ---',
    ].join('\n');
  }
}
