import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { tasksOnly } from '@upstart/back-office/shared';
import type { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './help-agent-crypto.util';
import { HelpAgentProvider } from './help-agent-provider.interface';
import { AnthropicHelpAgentProvider } from './providers/anthropic.provider';
import { OpenAiHelpAgentProvider } from './providers/openai.provider';
import { GeminiHelpAgentProvider } from './providers/gemini.provider';

const SETTINGS_ID = 'default';

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
        message: 'Connection test.',
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

  async ask(message: string, roleLabel: string): Promise<string> {
    const row = await this.prisma.helpAgentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      throw new NotFoundException('The Help Agent has not been configured yet. Ask a super user to set it up.');
    }

    const apiKey = decryptSecret(row.encryptedApiKey);
    const provider = this.providerFor(row.provider);
    const systemPrompt = this.loadGuide(roleLabel);

    return provider.generate({ systemPrompt, message, model: row.model, apiKey });
  }

  private loadGuide(roleLabel: string): string {
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
      'You are JD, the UpStart Back Office guide. Answer questions from people using the admin app using only the reference below. Refer to yourself as JD when it helps (e.g. "I can walk you through that").',
      `The person asking has the "${roleLabel}" role. The reference is written for the whole product, so only recommend screens, actions, or navigation this role can actually reach. Admins can use everything. "Tasks only" users see only Tasks in the menu. Regular users see only areas their tenant role grants. Super users can switch tenants and impersonate users — do not tell them to use tenant-only admin screens unless they are working in a tenant as an admin.`,
      "If something isn't covered by the reference, say so plainly instead of guessing.",
      'Keep answers short and direct. Use exact button and menu labels from the reference.',
      '',
      '--- REFERENCE START ---',
      guide,
      '--- REFERENCE END ---',
    ].join('\n');
  }
}
