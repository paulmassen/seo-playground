import { NextResponse } from 'next/server';
import { getActiveProject } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Lets an open tab notice that the active project was switched from another window. */
export async function GET() {
  const project = getActiveProject();
  return NextResponse.json({ id: project.id, name: project.name });
}
