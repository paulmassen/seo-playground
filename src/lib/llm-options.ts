export const PLATFORMS = [
  { value: 'chat_gpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'perplexity', label: 'Perplexity' },
] as const;

export type LlmPlatform = (typeof PLATFORMS)[number]['value'];

export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.label]),
);

// Every model_name DataForSEO returns from GET ai_optimization/{platform}/llm_responses/models
// (checked against the live API). The field accepts free text, so a model added later still works
// when typed in. Refresh this list from that endpoint when DataForSEO adds models.
export const MODELS_BY_PLATFORM: Record<LlmPlatform, string[]> = {
  chat_gpt: [
    'o4-mini', 'o4-mini-2025-04-16', 'o3-mini',
    'o3-mini-2025-01-31', 'o1', 'o1-2024-12-17',
    'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna',
    'gpt-6-astra', 'gpt-5.6-terra', 'gpt-5.6-sol',
    'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.5-2026-04-23',
    'gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17', 'gpt-5.4-mini',
    'gpt-5.4-mini-2026-03-17', 'gpt-5.4', 'gpt-5.4-2026-03-05',
    'gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.1',
    'gpt-5.1-2025-11-13', 'gpt-5-nano', 'gpt-5-nano-2025-08-07',
    'gpt-5-mini', 'gpt-5-mini-2025-08-07', 'gpt-5',
    'gpt-5-2025-08-07', 'gpt-4o-mini', 'gpt-4o-mini-2024-07-18',
    'gpt-4o', 'gpt-4o-2024-05-13', 'gpt-4o-2024-08-06',
    'gpt-4o-2024-11-20', 'gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14',
    'gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14', 'gpt-4.1',
    'gpt-4.1-2025-04-14', 'gpt-4-turbo', 'gpt-4-turbo-2024-04-09',
    'gpt-4', 'gpt-4-0613', 'gpt-3.5-turbo',
    'gpt-3.5-turbo-0125',
  ],
  claude: [
    'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-sonnet-4-6',
    'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929', 'claude-opus-5-5',
    'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
    'claude-opus-4-6', 'claude-opus-4-5', 'claude-opus-4-5-20251101',
    'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1',
    'claude-fable-5',
  ],
  gemini: [
    'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
    'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-pro',
    'gemini-2.5-flash-lite', 'gemini-2.5-flash',
  ],
  perplexity: [
    'sonar-reasoning-pro', 'sonar-pro', 'sonar',
  ],
};

// Pre-selected model when a platform is chosen.
export const DEFAULT_MODEL_BY_PLATFORM: Record<LlmPlatform, string> = {
  chat_gpt: 'gpt-5.5',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  perplexity: 'sonar',
};

export function isValidPlatform(value: string): value is LlmPlatform {
  return Object.prototype.hasOwnProperty.call(MODELS_BY_PLATFORM, value);
}
