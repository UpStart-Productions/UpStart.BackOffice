/** One chat turn. The list always starts with a user turn, alternates, and ends with the user's question. */
export interface HelpAgentTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface HelpAgentGenerateParams {
  systemPrompt: string;
  messages: HelpAgentTurn[];
  model: string;
  apiKey: string;
}

export interface HelpAgentProvider {
  generate(params: HelpAgentGenerateParams): Promise<string>;
}
