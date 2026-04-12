'use client';

import { useEffect, useState } from 'react';

export default function BalanceBadge() {
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/balance')
      .then((r) => r.json())
      .then((data: { balance: string | null }) => {
        if (data.balance !== null) setBalance(data.balance);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400 dark:text-slate-400">Balance</span>
      <span className="text-sm font-mono font-bold">
        {balance === null ? '…' : `$${balance}`}
      </span>
    </div>
  );
}
