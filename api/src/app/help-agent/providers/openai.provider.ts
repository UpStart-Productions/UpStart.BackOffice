import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { HelpAgentGenerateParams, HelpAgentProvider } from '../help-agent-provider.interface';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

@Injectable()
export class OpenAiHelpAgentProvider implements HelpAgentProvider {
  async generate({ systemPrompt, message, model, apiKey }: HelpAgentGenerateParams): Promise<string> {
    const res = await axios.post(
      OPENAI_CHAT_URL,
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        timeout: 30_000,
        validateStatus: () => true,
      },
    );

    if (res.status < 200 || res.status >= 300) {
      const detail =
        typeof res.data === 'object' ? res.data?.error?.message : String(res.data);
      throw new Error(`OpenAI API error (${res.status}): ${detail ?? 'unknown error'}`);
    }

    const text = res.data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error('OpenAI API returned an unexpected response shape');
    }
    return text;
  }
}
