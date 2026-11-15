import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject } from '@/lib/projects';
import { publishProject, sanitizePlatforms } from '@/lib/publish';
import { configuredPlatforms } from '@/lib/social-upload';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Which platforms can be published to from this server. */
export async function GET() {
  if (!(await currentUser())) return unauthorized();
  return NextResponse.json({ platforms: configuredPlatforms() });
}

/** Publish one of the user's ready projects now. Body: { projectId, platforms, description? } */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`publish:${user.id}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    const { projectId, platforms, description } = await req.json();
    if (!isValidJobId(projectId)) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const project = await getProject(projectId, user.id);
    if (!project) return notFound();
    const list = sanitizePlatforms(platforms);
    if (!list.length) return NextResponse.json({ error: 'platforms are required' }, { status: 400 });
    const results = await publishProject(project, list, typeof description === 'string' ? description : undefined);
    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
