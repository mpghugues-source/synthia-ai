import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { listProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in user's projects (kept for older clients; the library uses /api/projects). */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const projects = await listProjects(user.id);
  return NextResponse.json({ videos: projects.filter((p) => p.status === 'ready') });
}
