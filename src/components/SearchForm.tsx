'use client';

import { useState } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  btnLabel: string;
  btnClassName: string;
  loadingLabel?: string;
  disabled?: boolean;
}

export default function SearchForm({
  children, className, btnLabel, btnClassName, loadingLabel, disabled = false,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <form
      method="GET"
      className={className}
      onSubmit={() => { if (!disabled) setIsLoading(true); }}
    >
      {children}
      <button type="submit" disabled={disabled || isLoading} className={btnClassName}>
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {loadingLabel ?? 'Loading…'}
          </span>
        ) : btnLabel}
      </button>
    </form>
  );
}
