export const dynamic = 'force-dynamic';

import { getCredentials, getSetting } from '@/lib/db';
import { updateSettings, deleteCredentials } from './actions';
import LocationPicker from '@/components/LocationPicker';

interface DFUserResponse {
  tasks?: Array<{
    result?: Array<{
      money?: { balance?: number };
    }>;
  }>;
}

const inputCls = 'w-full px-5 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-600 transition-all font-medium';

export default async function SettingsPage() {
  const creds = getCredentials();
  const defaultLocation = getSetting('default_location') ?? '';
  const defaultCoordinates = getSetting('default_coordinates') ?? '';
  const defaultLanguage = getSetting('default_language') ?? '';
  const defaultDomain = getSetting('default_domain') ?? '';

  let balance = 0;
  let status = 'NOT CONNECTED';

  if (creds) {
    try {
      const auth = btoa(`${creds.login}:${creds.pass}`);
      const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
        headers: { Authorization: `Basic ${auth}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json() as DFUserResponse;
        balance = data.tasks?.[0]?.result?.[0]?.money?.balance ?? 0;
        status = 'CONNECTED';
      } else {
        status = `ERROR ${res.status}`;
      }
    } catch {
      status = 'CONNECTION ERROR';
    }
  }

  const connected = status === 'CONNECTED';

  return (
    <div className="max-w-2xl space-y-8 pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium">DataForSEO API Management</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest border ${
          connected
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
        }`}>
          {status}
        </div>
      </div>

      {/* Balance Card */}
      <div className="bg-slate-900 dark:bg-slate-800 rounded-[2rem] p-10 text-white shadow-2xl shadow-slate-200 dark:shadow-none relative overflow-hidden border border-slate-800 dark:border-slate-700">
        <div className="relative z-10">
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Total Available Credits</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-6xl font-mono font-bold tracking-tighter leading-none">${balance.toFixed(2)}</span>
            <div className="h-10 w-[2px] bg-slate-700 mx-2" />
            <span className="text-slate-400 text-xs font-bold leading-tight">USD<br />BALANCE</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm p-1">
        <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-[1.4rem] p-8">
          <form action={updateSettings} className="space-y-8">
            {/* API Credentials */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">API Credentials</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Username</label>
                  <input name="login" type="text" defaultValue={creds?.login || ''} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">API Password</label>
                  <input name="password" type="password" className={inputCls} />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* Search Defaults */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Search Defaults</p>
              <p className="text-xs text-slate-400 mb-4">Pre-filled values across all search forms.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Default Location</label>
                  <LocationPicker name="default_location" defaultValue={defaultLocation} placeholder="e.g. France, Paris" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Default Language</label>
                  <input name="default_language" type="text" defaultValue={defaultLanguage} placeholder="e.g. French" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Default Coordinates</label>
                  <input name="default_coordinates" type="text" defaultValue={defaultCoordinates} placeholder="e.g. 45.7640,4.8357" className={inputCls} />
                  <p className="text-[10px] text-slate-400 ml-1">lat,lng — used for Maps &amp; Local Finder</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Default Domain</label>
                  <input name="default_domain" type="text" defaultValue={defaultDomain} placeholder="e.g. example.com" className={inputCls} />
                  <p className="text-[10px] text-slate-400 ml-1">Used in Rank Tracker &amp; domain-based tools</p>
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-700 shadow-xl shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98]">
              Save Settings
            </button>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 rounded-3xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-md">
          <h2 className="text-red-600 dark:text-red-400 font-black text-xs uppercase tracking-widest mb-1">Danger Zone</h2>
          <p className="text-xs text-red-700/60 dark:text-red-400/60 font-medium leading-relaxed">Removes your locally stored credentials.</p>
        </div>
        <form action={deleteCredentials}>
          <button type="submit" className="px-6 py-3 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-600 dark:hover:bg-red-700 hover:text-white dark:hover:border-red-700 transition-all">
            Disconnect
          </button>
        </form>
      </div>
    </div>
  );
}
