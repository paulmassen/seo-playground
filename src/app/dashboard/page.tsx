export const dynamic = 'force-dynamic';

import { getCredentials } from '@/lib/db';
import { saveCredentialsAction } from './actions';

export default async function DashboardPage() {
  const creds = getCredentials();

  if (!creds) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-lg mx-auto mt-10">
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Connexion DataForSEO</h2>
        <p className="text-slate-500 text-sm mb-8">Entrez vos identifiants API pour commencer. Ils seront stockés localement.</p>
        <form action={saveCredentialsAction} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Login</label>
            <input type="text" name="login" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">API Password</label>
            <input type="password" name="password" required className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white font-black uppercase text-xs tracking-widest py-3.5 rounded-xl hover:bg-blue-700 transition-colors">
            Enregistrer
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Sélectionnez un outil dans la barre latérale.</p>
      </div>
    </div>
  );
}
