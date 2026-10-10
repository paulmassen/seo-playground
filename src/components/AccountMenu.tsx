'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function AccountMenu({ email }: { email: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.assign('/login');
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="hidden sm:inline max-w-48 truncate" title={email}>{email}</span>
      <button type="button" onClick={signOut} disabled={pending} title="Sign out" aria-label="Sign out"
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 disabled:opacity-60 transition-colors">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
