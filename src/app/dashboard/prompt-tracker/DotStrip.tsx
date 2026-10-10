import StatusDot from './StatusDot';
import { checkStatus, STATUS_LABEL } from '@/lib/prompt-report';
import type { PromptCheck } from '@/lib/db';

/** Most recent checks as a row of dots, oldest on the left. Empty slots keep the strip a fixed width. */
export default function DotStrip({ checks, slots = 30 }: { checks: PromptCheck[]; slots?: number }) {
  const recent = [...checks].sort((a, b) => a.checkedAt - b.checkedAt).slice(-slots);
  const empty = Array.from({ length: Math.max(0, slots - recent.length) });
  return (
    <div className="flex items-center gap-1 flex-wrap" aria-label="Recent checks">
      {empty.map((_, i) => <StatusDot key={`empty-${i}`} status={null} size="sm" />)}
      {recent.map((c) => {
        const status = checkStatus(c);
        return <StatusDot key={c.id} status={status} size="sm" title={`${c.date}: ${STATUS_LABEL[status]}`} />;
      })}
    </div>
  );
}
