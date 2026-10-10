import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import AuthShell from '@/components/AuthShell';
import { hasUsers } from '@/lib/auth';
import { authEnabled } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!authEnabled()) redirect('/dashboard');
  if (await hasUsers()) redirect('/login');

  return (
    <AuthShell title="Create your account" subtitle="This is the only account. Registration closes once it exists.">
      <AuthForm mode="setup" next="/dashboard" />
    </AuthShell>
  );
}
