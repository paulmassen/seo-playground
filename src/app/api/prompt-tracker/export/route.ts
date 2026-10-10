import { NextRequest, NextResponse } from 'next/server';
import {
  getTrackedPrompt, getTrackedPrompts, getPromptChecks, getLatestPromptChecks, getPromptCheckTotals,
} from '@/lib/db';
import { promptMarkdown, overviewMarkdown, type OverviewItem } from '@/lib/prompt-report';

export const dynamic = 'force-dynamic';

// Full calendar needs the whole history; a year of daily checks is well inside this cap.
const HISTORY_LIMIT = 366;

/**
 * GET /api/prompt-tracker/export?id=<promptId>  -> markdown report for one prompt (calendar + history)
 * GET /api/prompt-tracker/export                -> markdown overview of every prompt
 */
export async function GET(request: NextRequest) {
  const generatedAt = Date.now();
  const rawId = request.nextUrl.searchParams.get('id');
  const stamp = new Date(generatedAt).toISOString().slice(0, 10);

  if (rawId !== null) {
    const id = Number(rawId);
    const prompt = Number.isInteger(id) && id > 0 ? getTrackedPrompt(id) : null;
    if (!prompt) return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    const totals = getPromptCheckTotals().get(prompt.id) ?? { total: 0, mentioned: 0 };
    const body = promptMarkdown({
      prompt, checks: getPromptChecks(prompt.id, HISTORY_LIMIT), total: totals.total, mentioned: totals.mentioned, generatedAt,
    });
    return markdownResponse(body, `prompt-${prompt.id}-${stamp}.md`);
  }

  const latest = getLatestPromptChecks();
  const totals = getPromptCheckTotals();
  const items: OverviewItem[] = getTrackedPrompts().map((prompt) => {
    const t = totals.get(prompt.id) ?? { total: 0, mentioned: 0 };
    return { prompt, checks: getPromptChecks(prompt.id, 14), total: t.total, mentioned: t.mentioned, latest: latest.get(prompt.id) };
  });
  return markdownResponse(overviewMarkdown(items, generatedAt), `prompt-tracker-overview-${stamp}.md`);
}

function markdownResponse(body: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
