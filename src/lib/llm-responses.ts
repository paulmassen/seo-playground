import { callDataForSeoFirst, type DfsCredentials } from '@/lib/dataforseo';
import type { LlmPlatform } from '@/lib/llm-options';

// Shared by AI Prompt Test and Prompt Tracker so both send the same request to
// ai_optimization/{platform}/llm_responses/live.

export interface Annotation {
  title?: string;
  url?: string;
}

export interface ResponseSection {
  type?: string;
  text?: string;
  annotations?: Annotation[];
}

export interface ResponseItem {
  type?: string;
  sections?: ResponseSection[];
}

export interface LlmResponseResult {
  platform?: string;
  model_name?: string;
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  web_search?: boolean;
  money_spent?: number;
  datetime?: string;
  items?: ResponseItem[];
  fan_out_queries?: Array<{ keyword?: string }> | null;
}

export async function fetchLlmResponse(
  platform: LlmPlatform,
  prompt: string,
  model: string,
  webSearch: boolean,
  countryCode: string,
  systemMessage: string,
  creds: DfsCredentials,
): Promise<{ result?: LlmResponseResult; cost?: number; error?: string }> {
  const body: Record<string, unknown> = { user_prompt: prompt, model_name: model };
  if (platform !== 'perplexity') body.web_search = webSearch;
  if (systemMessage) body.system_message = systemMessage;
  if (countryCode && (webSearch || platform === 'perplexity')) body.web_search_country_iso_code = countryCode.toUpperCase();

  return callDataForSeoFirst<LlmResponseResult>(`ai_optimization/${platform}/llm_responses/live`, body, creds);
}
