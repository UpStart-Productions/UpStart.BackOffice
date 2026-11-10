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

export interface HelpAgentToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface HelpAgentToolCallLog {
  tool: string;
  args: Record<string, unknown>;
  error?: boolean;
}

export interface HelpAgentToolRunParams extends HelpAgentGenerateParams {
  tools: HelpAgentToolSpec[];
  callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
  /** Most tool calls for one question; after that the model must answer with what it has. */
  maxToolCalls: number;
}

export interface HelpAgentRunResult {
  text: string;
  toolCalls: HelpAgentToolCallLog[];
  inputTokens: number;
  outputTokens: number;
}

export interface HelpAgentProvider {
  generate(params: HelpAgentGenerateParams): Promise<string>;
  /** Answer using tools (record lookups). Only providers that support it implement this. */
  generateWithTools?(params: HelpAgentToolRunParams): Promise<HelpAgentRunResult>;
}
