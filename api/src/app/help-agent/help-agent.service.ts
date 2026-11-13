import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  HELP_AGENT_NAME,
  HELP_AGENT_REPORT_TOOL,
  normalizeHelpAgentReport,
  normalizeHelpLabel,
  type HelpAgentReport,
  tasksOnly,
  type HelpAgentHistoryMessage,
  type HelpAgentPageContext,
  type HelpAgentTarget,
} from '@upstart/back-office/shared';
import { HELP_AGENT_UI_LABELS } from '@upstart/back-office/shared/help-labels';
import type { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './help-agent-crypto.util';
import { HelpAgentProvider, HelpAgentToolCallLog, HelpAgentToolSpec, HelpAgentTurn } from './help-agent-provider.interface';
import { AnthropicHelpAgentProvider } from './providers/anthropic.provider';
import { OpenAiHelpAgentProvider } from './providers/openai.provider';
import { GeminiHelpAgentProvider } from './providers/gemini.provider';
import { personalNoteFor } from './personal-touches';
import { tryTenantId } from '../tenancy/tenant-context';
import {
  HELP_AGENT_TOOL_LABELS,
  HELP_AGENT_WRITE_TOOLS,
  isHelpAgentWriteTool,
  openHelpAgentMcpSession,
  type HelpAgentCaller,
  type HelpAgentMcpSession,
} from './help-agent-mcp.client';

/** Most record lookups for one question. */
/** Includes make_report (a report is usually one or two lookups, then the report). */
const MAX_TOOL_CALLS = 8;

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
  /** Changes the guide proposes; each runs only when the person confirms it (POST /help-agent/actions/run). */
  actions: Array<{ tool: string; title: string; confirm: string; args: Record<string, unknown> }>;
  /** Reports built this turn (make_report): the widget shows a link that opens each one in a large view. */
  reports: HelpAgentReport[];
}

/** Modes: guide only (help files, no record data) or reads records (tools through the MCP server). */
type HelpAgentMode =
  | { readsRecords: false; unavailable?: boolean; impersonating?: boolean }
  | { readsRecords: true; makesChanges: boolean; session: HelpAgentMcpSession };

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
    'Format for readability: one short lead line, then markdown lists. Never use em dashes (—); never chain fields with dashes on one line. Use `-` bullets for breakdowns (paid vs sent, totals by client). For several records, use one `-` line per record: the first thing on the line must be the markdown link from tool results (e.g. [LOVINC-0004](/invoices/…)); put client, status, amount and date on indented `-` lines under it. Do not use bold instead of a link when a link was provided.',
    'Tool results link record names like [Fix login bug](https://…). Whenever you mention one of those records, keep its markdown link exactly as given so the person can click straight to it. Never write, change or guess a link yourself.',
    'If a name matches several records, ask which one. Never guess or pick one yourself.',
    'Reports: when they ask for a report, a PDF or something to print or export, look the records up, then call make_report once with the content. Use only values from your tool results, list every matching record (never a sample), leave totals to the report, and reply with one short line. A report is only for reading: it never changes anything.',
    'For communication history (emails, calls, meetings, notes with a person or organization), use list_activity; for a report of it, put each item in a conversation block, oldest first.',
    'For forms, use get_form to see a form\'s sections, questions, options, points and scoring, list_form_submissions for responses with scores, and get_form_submission for one response\'s answers and score by area.',
    'For unbilled time, use preview_invoice_from_time. A project name alone is enough (its client is used); only ask for a client when they named neither. Default to the current month unless they say otherwise.',
  ];
}

/** Prompt rules about changing records: proposals the person confirms on a card. */
function changeRules(makesChanges: boolean): string[] {
  if (!makesChanges) {
    return [
      'You can only read records, not change them. If asked to create, update or send something, explain how to do it on the screen.',
    ];
  }
  return [
    'Changes are switched on for this organization. Earlier messages in this chat may say you can only read records; that was before, so ignore it.',
    'You can also propose changes with your create, update, link, task and activity tools. Calling one does NOT change anything: the person sees a confirmation card with the details and decides. So never say a change is done; say briefly what you propose and that they can confirm it below.',
    'To put someone on a project, use add_person_to_project: as "contact" for people from People (e.g. the client\'s staff), as "team" for Back Office teammates who work on it (lead true for a project lead). Linking a person to an organization is different; only do that when they ask about the organization.',
    'Before proposing a create, search for an existing record with a similar name. If one exists, ask whether they mean that one instead of creating a duplicate.',
    'Only use values the person gave you or that you looked up. Never invent emails, phone numbers, websites or other details; leave a field out instead.',
    'Propose one change at a time unless they clearly asked for several (then use the bulk tool, e.g. create_tasks).',
    'You can create draft invoices. A draft is never sent. For tracked time, always use create_invoice_from_time with the client and period (call preview_invoice_from_time first to show the totals); it links the time so it is never billed twice. Never copy preview lines into create_invoice. Use create_invoice only for fixed fees or one-off charges the person spells out, and only name a project that exists. Never make up amounts, rates or hours. You cannot edit, send or mark invoices paid, change time or expenses, or change pipeline cards: explain how to do those on the screen.',
    'You can build and edit forms: create_form (a whole form with sections and questions in one proposal), update_form (name, description, layout, review, results email, thank-you), set_form_scoring (score areas and profiles), add/update/move sections and fields, publish_form, create_form_link, and dismissing or restoring a submission. Call get_form first and use the exact section and field names it shows. On scored forms give options points and a score area. Changes go to the draft; say that publishing makes them live. You cannot delete forms, sections, fields or submissions: explain how to do that on the screen.',
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
        // make_report runs here, not on the MCP server: it only shapes what was already looked up.
        const reports: HelpAgentReport[] = [];
        const looked: string[] = [];
        const callTool = async (name: string, args: Record<string, unknown>) => {
          if (name !== HELP_AGENT_REPORT_TOOL.name) {
            const out = await mode.session.call(name, args);
            if (!out.isError) looked.push(HELP_AGENT_TOOL_LABELS[name] ?? name);
            return out;
          }
          try {
            const report = normalizeHelpAgentReport(args, { id: randomUUID(), sources: [...new Set(looked)], createdAt: new Date().toISOString() });
            reports.push(report);
            return { text: `Report "${report.title}" is ready; the person opens it from a link under your reply. Introduce it in one short line.`, isError: false };
          } catch (err) {
            return { text: err instanceof Error ? err.message : 'That report could not be built.', isError: true };
          }
        };
        const run = await provider.generateWithTools({
          systemPrompt,
          messages,
          model: row.model,
          apiKey,
          tools: [...mode.session.tools, HELP_AGENT_REPORT_TOOL as unknown as HelpAgentToolSpec],
          callTool,
          maxToolCalls: MAX_TOOL_CALLS,
          ...(mode.makesChanges ? { isWriteTool: isHelpAgentWriteTool } : {}),
        });
        const proposed = run.proposedActions.map((a) => ({ ...a, proposed: true }));
        // A report's contents are record data: the usage log keeps only its title.
        const logged = run.toolCalls.map((c) => (c.tool === HELP_AGENT_REPORT_TOOL.name ? { ...c, args: { title: c.args['title'] } } : c));
        await this.logUsage(options.caller?.userId, row.model, true, {
          ...run,
          toolCalls: [...logged, ...proposed],
        });
        const lookups = [...new Set(run.toolCalls.filter((c) => c.tool !== HELP_AGENT_REPORT_TOOL.name).map((c) => HELP_AGENT_TOOL_LABELS[c.tool] ?? c.tool))];
        const actions = run.proposedActions.map((a) => ({ ...a, ...HELP_AGENT_WRITE_TOOLS[a.tool] }));
        const answer =
          run.text.trim() ||
          (actions.length ? "Here's what I'd do. Nothing changes until you confirm." : reports.length ? 'Your report is ready.' : '');
        return { answer, lookups, actions, reports };
      }

      const answer = await provider.generate({ systemPrompt, messages, model: row.model, apiKey });
      await this.logUsage(options.caller?.userId, row.model, false, null);
      return { answer, lookups: [], actions: [], reports: [] };
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
    if (!provider.generateWithTools || !tryTenantId()) return { readsRecords: false };
    if (caller.impersonating) return { readsRecords: false, impersonating: true };
    const { readsRecords, makesChanges } = await this.tenantSwitches();
    if (!readsRecords) return { readsRecords: false };
    try {
      const session = await openHelpAgentMcpSession(caller, { writes: makesChanges });
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(
          `Guide mode: reads records, changes ${makesChanges ? 'on' : 'off'}; tools: ${session.tools.map((t) => t.name).join(', ') || '(none)'}`,
        );
      }
      return { readsRecords: true, makesChanges, session };
    } catch (err) {
      this.logger.warn(`Guide record lookups unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return { readsRecords: false, unavailable: true };
    }
  }

  /** The tenant's switches (Settings → Back Office guide). Changes need reading records. */
  private async tenantSwitches(): Promise<{ readsRecords: boolean; makesChanges: boolean }> {
    const tenantId = tryTenantId();
    if (!tenantId) return { readsRecords: false, makesChanges: false };
    const profile = await this.prisma.organizationProfile.findUnique({
      where: { tenantId },
      select: { guideReadsRecords: true, guideMakesChanges: true },
    });
    const readsRecords = profile?.guideReadsRecords ?? false;
    return { readsRecords, makesChanges: readsRecords && (profile?.guideMakesChanges ?? false) };
  }

  /**
   * Runs one change the person confirmed on a card. Same checks as asking (tenant switch on, not
   * impersonating, allowlisted tool), then the MCP server runs it as them, so their role applies.
   */
  async runAction(
    tool: string,
    args: Record<string, unknown>,
    caller: NonNullable<HelpAgentAskOptions['caller']>,
  ): Promise<{ result: string; isError: boolean }> {
    if (!isHelpAgentWriteTool(tool)) throw new BadRequestException('The guide cannot do that.');
    if (caller.impersonating) throw new BadRequestException('Changes are off while impersonating.');
    if (!(await this.tenantSwitches()).makesChanges) {
      throw new BadRequestException(
        'The guide is not allowed to make changes here. An admin can turn it on in Settings → Back Office guide.',
      );
    }
    let session: HelpAgentMcpSession;
    try {
      session = await openHelpAgentMcpSession(caller, { writes: true });
    } catch {
      throw new BadRequestException('Could not reach Back Office records right now. Try again shortly.');
    }
    try {
      const out = await session.call(tool, args);
      const settings = await this.prisma.helpAgentSettings.findUnique({
        where: { id: SETTINGS_ID },
        select: { model: true },
      });
      await this.logUsage(caller.userId, settings?.model ?? '', true, {
        toolCalls: [{ tool, args, confirmed: true, ...(out.isError ? { error: true } : {}) }],
        inputTokens: 0,
        outputTokens: 0,
      });
      return { result: out.text, isError: out.isError };
    } finally {
      await session.close();
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
      ? [...recordRules(), ...changeRules(mode.makesChanges)]
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
