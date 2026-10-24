import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { HelpAgentGenerateParams, HelpAgentProvider } from '../help-agent-provider.interface';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

@Injectable()
export class GeminiHelpAgentProvider implements HelpAgentProvider {
  async generate({ systemPrompt, message, model, apiKey }: HelpAgentGenerateParams): Promise<string> {
    const res = await axios.post(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: message }] }],
      },
      {
        params: { key: apiKey },
        headers: { 'content-type': 'application/json' },
        timeout: 30_000,
        validateStatus: () => true,
      },
    );

    if (res.status < 200 || res.status >= 300) {
      const detail =
        typeof res.data === 'object' ? res.data?.error?.message : String(res.data);
      throw new Error(`Gemini API error (${res.status}): ${detail ?? 'unknown error'}`);
    }

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error('Gemini API returned an unexpected response shape');
    }
    return text;
  }
}
