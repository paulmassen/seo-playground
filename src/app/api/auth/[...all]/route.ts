import { getAuth } from '@/lib/auth';
import { authEnabled } from '@/lib/auth-config';

export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  if (!authEnabled()) return Response.json({ error: 'Login is not enabled.' }, { status: 404 });
  return (await getAuth()).handler(request);
}

export { handle as GET, handle as POST };
