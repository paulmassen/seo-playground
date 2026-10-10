import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import AuthShell from '@/components/AuthShell';
import { getSession, hasUsers } from '@/lib/auth';
import { authEnabled, safeNextPath } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (!authEnabled()) redirect('/dashboard');
  const next = safeNextPath((await searchParams).next);
  if (!(await hasUsers())) redirect('/setup');
  if (await getSession(await headers())) redirect(next);

  return (
    <AuthShell title="Sign in" subtitle="Enter your email and password to open the dashboard.">
      <AuthForm mode="login" next={next} />
    </AuthShell>
  );
}
