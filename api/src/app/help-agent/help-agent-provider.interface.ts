export interface HelpAgentGenerateParams {
  systemPrompt: string;
  message: string;
  model: string;
  apiKey: string;
}

export interface HelpAgentProvider {
  generate(params: HelpAgentGenerateParams): Promise<string>;
}
