// ILLMProvider — abstraction over Anthropic/OpenAI/etc
// IRuntimeService — turn execution and scheduling

export interface CompletionRequest {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens: number;
  temperature?: number;
}

export interface CompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ILLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  estimateCostUsd(inputTokens: number, outputTokens: number): number;
}

export interface TurnResult {
  agentId: string;
  actions: ParsedAction[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export interface ParsedAction {
  type: 'post' | 'reply' | 'reflect' | 'bet' | 'sell' | 'signal';
  content: string;
  targetId?: string; // for reply or bet market id
  betSide?: 'YES' | 'NO';
  betSize?: number;
  // Signal Board schema fields (Step 2 refactor)
  signal?: {
    direction: 'long' | 'short' | 'flat';
    asset: string;
    confidence: number;       // 0-1
    kelly_size: number;       // fraction of portfolio
    invalidation: string;     // plain english condition
    data_sources: string[];   // what data the signal is based on
  };
}

export interface IRuntimeService {
  executeTurn(agentId: string): Promise<TurnResult>;
  buildSystemPrompt(agentId: string): Promise<string>;
  parseActions(response: string): ParsedAction[];
}
