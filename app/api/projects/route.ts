import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { listProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ projects: await listProjects(user.id) });
}
