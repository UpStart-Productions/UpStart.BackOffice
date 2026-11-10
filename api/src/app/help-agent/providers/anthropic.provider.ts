import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  HelpAgentGenerateParams,
  HelpAgentProposedAction,
  HelpAgentProvider,
  HelpAgentRunResult,
  HelpAgentToolCallLog,
  HelpAgentToolRunParams,
} from '../help-agent-provider.interface';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

type AnthropicBlock = { type: string; [key: string]: unknown };
type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicBlock[] };

@Injectable()
export class AnthropicHelpAgentProvider implements HelpAgentProvider {
  async generate({ systemPrompt, messages, model, apiKey }: HelpAgentGenerateParams): Promise<string> {
    const res = await axios.post(
      ANTHROPIC_API_URL,
      {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
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

  /**
   * Tool loop: the model asks for tools, we run them (via the MCP server) and send results back, until it
   * answers. After maxToolCalls, one last round with tool_choice "none" makes it answer with what it has.
   */
  async generateWithTools(params: HelpAgentToolRunParams): Promise<HelpAgentRunResult> {
    const { systemPrompt, model, apiKey, tools, callTool, maxToolCalls, isWriteTool } = params;
    const messages: AnthropicMessage[] = params.messages.map((m) => ({ role: m.role, content: m.content }));
    const toolCalls: HelpAgentToolCallLog[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let round = 0; round <= maxToolCalls; round++) {
      const limitReached = toolCalls.length >= maxToolCalls;
      const res = await axios.post(
        ANTHROPIC_API_URL,
        {
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
          ...(limitReached ? { tool_choice: { type: 'none' } } : {}),
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            'content-type': 'application/json',
          },
          timeout: 60_000,
          validateStatus: () => true,
        },
      );

      if (res.status < 200 || res.status >= 300) {
        const detail = typeof res.data === 'object' ? res.data?.error?.message : String(res.data);
        throw new Error(`Anthropic API error (${res.status}): ${detail ?? 'unknown error'}`);
      }

      inputTokens += Number(res.data?.usage?.input_tokens) || 0;
      outputTokens += Number(res.data?.usage?.output_tokens) || 0;
      const content: AnthropicBlock[] = Array.isArray(res.data?.content) ? res.data.content : [];
      const toolUses = content.filter((b) => b.type === 'tool_use');

      if (res.data?.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const text = extractAnthropicAssistantText(res.data);
        if (!text) throw new Error('Anthropic API returned no answer text.');
        return { text, toolCalls, inputTokens, outputTokens, proposedActions: [] };
      }

      // A change: stop here and hand it to the person to confirm. Nothing in this turn runs.
      const writes = isWriteTool ? toolUses.filter((u) => isWriteTool(String(u.name))) : [];
      if (writes.length) {
        const proposedActions: HelpAgentProposedAction[] = writes.map((u) => ({
          tool: String(u.name),
          args: (u.input && typeof u.input === 'object' ? u.input : {}) as Record<string, unknown>,
        }));
        return {
          text: extractAnthropicAssistantText(res.data) ?? '',
          toolCalls,
          inputTokens,
          outputTokens,
          proposedActions,
        };
      }

      // Send the assistant turn back unchanged (thinking blocks must keep their signatures).
      messages.push({ role: 'assistant', content });
      const results: AnthropicBlock[] = [];
      for (const use of toolUses) {
        const name = String(use.name);
        const args = (use.input && typeof use.input === 'object' ? use.input : {}) as Record<string, unknown>;
        if (toolCalls.length >= maxToolCalls) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: 'Lookup limit reached for this question. Answer with what you have.',
            is_error: true,
          });
          continue;
        }
        let out: { text: string; isError: boolean };
        try {
          out = await callTool(name, args);
        } catch (err) {
          out = { text: err instanceof Error ? err.message : 'The lookup failed.', isError: true };
        }
        toolCalls.push({ tool: name, args, ...(out.isError ? { error: true } : {}) });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: out.text, ...(out.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
    }
    throw new Error('The guide could not finish this answer.');
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
