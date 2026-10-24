import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { HelpAgentGenerateParams, HelpAgentProvider } from '../help-agent-provider.interface';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

@Injectable()
export class AnthropicHelpAgentProvider implements HelpAgentProvider {
  async generate({ systemPrompt, message, model, apiKey }: HelpAgentGenerateParams): Promise<string> {
    const res = await axios.post(
      ANTHROPIC_API_URL,
      {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        timeout: 30_000,
        validateStatus: () => true,
      },
    );

    if (res.status < 200 || res.status >= 300) {
      const detail =
        typeof res.data === 'object' ? res.data?.error?.message : String(res.data);
      throw new Error(`Anthropic API error (${res.status}): ${detail ?? 'unknown error'}`);
    }

    const text = extractAnthropicAssistantText(res.data);
    if (!text) {
      const types = Array.isArray(res.data?.content)
        ? res.data.content.map((b: { type?: string }) => b?.type).filter(Boolean)
        : [];
      throw new Error(
        `Anthropic API returned no text block${types.length ? ` (blocks: ${types.join(', ')})` : ''}. Try increasing max_tokens or check the model ID.`,
      );
    }
    return text;
  }
}

/** Sonnet 5.x returns thinking blocks before text; older models may return text at index 0 only. */
function extractAnthropicAssistantText(data: unknown): string | null {
  const content = (data as { content?: unknown })?.content;
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const typed = block as { type?: string; text?: string };
    if (typed.type === 'text' && typeof typed.text === 'string' && typed.text.trim()) {
      parts.push(typed.text);
    }
  }
  return parts.length ? parts.join('\n\n') : null;
}
