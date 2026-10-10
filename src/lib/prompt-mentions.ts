import type { ResponseItem } from '@/lib/llm-responses';
import type { PromptSource } from '@/lib/db';

// Pure helpers for Prompt Tracker: turn a DataForSEO LLM response into answer text, sources and a
// brand/domain mention verdict. No I/O here so they can be unit-tested directly.

/** Visible answer text, skipping reasoning blocks. */
export function extractAnswerText(items: ResponseItem[] | undefined): string {
  return (items ?? [])
    .filter((item) => item.type !== 'reasoning')
    .flatMap((item) => item.sections ?? [])
    .map((section) => section.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}

/** Unique cited URLs, in the order the model returned them. */
export function extractSources(items: ResponseItem[] | undefined): PromptSource[] {
  const seen = new Set<string>();
  const sources: PromptSource[] = [];
  for (const item of items ?? []) {
    if (item.type === 'reasoning') continue;
    for (const section of item.sections ?? []) {
      for (const annotation of section.annotations ?? []) {
        if (!annotation.url || seen.has(annotation.url)) continue;
        seen.add(annotation.url);
        sources.push({ title: annotation.title, url: annotation.url });
      }
    }
  }
  return sources;
}

/** "https://www.Example.com/page" -> "example.com". */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
    .replace(/\.$/, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Counts whole-word, case-insensitive occurrences of the brand. "Acme" matches "Acme." and
 * "ACME", but not "Acmelab".
 */
export function countBrandMentions(answer: string, brand: string): number {
  const name = brand.trim();
  if (!name) return 0;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, 'giu');
  return answer.match(pattern)?.length ?? 0;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** A domain counts as cited when a source URL is on it (or a subdomain), or it is written out in the answer. */
export function isDomainCited(answer: string, sources: PromptSource[], domain: string): boolean {
  const target = normalizeDomain(domain);
  if (!target) return false;
  const inSources = sources.some((source) => {
    const host = source.url ? hostOf(source.url) : null;
    return host !== null && (host === target || host.endsWith(`.${target}`));
  });
  if (inSources) return true;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegex(target)}(?![\\p{L}\\p{N}-])`, 'iu');
  return pattern.test(answer);
}

export interface MentionVerdict {
  mentioned: boolean;
  brandMentions: number;
  domainCited: boolean;
}

export function detectMention(input: { answer: string; sources: PromptSource[]; brand: string; domain: string }): MentionVerdict {
  const brandMentions = countBrandMentions(input.answer, input.brand);
  const domainCited = isDomainCited(input.answer, input.sources, input.domain);
  return { mentioned: brandMentions > 0 || domainCited, brandMentions, domainCited };
}
