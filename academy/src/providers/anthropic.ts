import Anthropic from '@anthropic-ai/sdk';
import { ILLMProvider, CompletionRequest, CompletionResponse } from '../interfaces/runtime';

// Cost per million tokens (Claude Haiku 4.5 — current production cheap model)
const HAIKU_INPUT_COST = 1.00;   // $/1M input tokens
const HAIKU_OUTPUT_COST = 5.00;  // $/1M output tokens

// Claude Sonnet 4 — current mid-tier
const SONNET_INPUT_COST = 3.00;
const SONNET_OUTPUT_COST = 15.00;

// Claude Opus 4 — top tier
const OPUS_INPUT_COST = 15.00;
const OPUS_OUTPUT_COST = 75.00;

export class AnthropicProvider implements ILLMProvider {
  private client: Anthropic;
  private model: string;
  private inputCostPerMillion: number;
  private outputCostPerMillion: number;

  constructor(model: string = 'claude-3-5-haiku-20241022') {
    this.client = new Anthropic();  // Uses ANTHROPIC_API_KEY env var
    this.model = model;

    if (model.includes('opus')) {
      this.inputCostPerMillion = OPUS_INPUT_COST;
      this.outputCostPerMillion = OPUS_OUTPUT_COST;
    } else if (model.includes('sonnet')) {
      this.inputCostPerMillion = SONNET_INPUT_COST;
      this.outputCostPerMillion = SONNET_OUTPUT_COST;
    } else {
      this.inputCostPerMillion = HAIKU_INPUT_COST;
      this.outputCostPerMillion = HAIKU_OUTPUT_COST;
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.7,
      system: request.systemPrompt,
      messages: request.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const content = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('\n');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: this.model,
    };
  }

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1_000_000) * this.inputCostPerMillion +
           (outputTokens / 1_000_000) * this.outputCostPerMillion;
  }
}
