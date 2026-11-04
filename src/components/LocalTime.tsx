'use client';

/**
 * Renders a timestamp in the reader's own time zone, so the monitors list, snapshot picker
 * and trend chart all agree. The server (often UTC in Docker) renders its own zone first;
 * the browser re-renders with the real one, hence the scoped hydration-warning opt-out.
 */
const FORMATS = {
  short: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false },
  long: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  day: { day: 'numeric', month: 'short' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type LocalTimeFormat = keyof typeof FORMATS;

export function formatLocalTime(ts: number, format: LocalTimeFormat = 'short'): string {
  return new Intl.DateTimeFormat('en-GB', FORMATS[format]).format(new Date(ts));
}

export default function LocalTime({ ts, format = 'short', className }: { ts: number; format?: LocalTimeFormat; className?: string }) {
  return (
    <time dateTime={new Date(ts).toISOString()} className={className} suppressHydrationWarning>
      {formatLocalTime(ts, format)}
    </time>
  );
}
