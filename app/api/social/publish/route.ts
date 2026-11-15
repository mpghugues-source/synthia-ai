import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject, updateProject } from '@/lib/projects';
import { publishProject, sanitizePlatforms, sanitizeOptions, connectedPlatforms } from '@/lib/publish';

export const runtime = 'nodejs';

/** Which platforms this user has connected. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ platforms: await connectedPlatforms(user.id) });
}

/**
 * Publish one of the user's ready projects now, in the background (uploads can outlast the 100 s
 * Cloudflare allows a request). Poll GET /api/projects/:id for publishStatus / publishResults.
 * Body: { projectId, platforms, options? }
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`publish:${user.id}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    const { projectId, platforms, options } = await req.json();
    if (!isValidJobId(projectId)) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const project = await getProject(projectId, user.id);
    if (!project) return notFound();
    if (project.status !== 'ready') return NextResponse.json({ error: 'video not ready' }, { status: 409 });
    if (project.publishStatus === 'publishing') return NextResponse.json({ success: true, queued: true });
    const list = sanitizePlatforms(platforms);
    if (!list.length) return NextResponse.json({ error: 'platforms are required' }, { status: 400 });
    const opts = sanitizeOptions(options);
    await updateProject(project.id, { publishStatus: 'publishing', platforms: list, publishOptions: opts, publishResults: null });
    void publishProject(project, list, opts).catch(async (e) => {
      console.error('[publish]', e);
      await updateProject(project.id, { publishStatus: 'failed', publishResults: [{ success: false, error: 'upload_failed' }] }).catch(() => {});
    });
    return NextResponse.json({ success: true, queued: true });
  } catch (err) {
    console.error('[publish]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
