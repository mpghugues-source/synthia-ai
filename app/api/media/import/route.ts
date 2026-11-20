import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { agentImportUrl } from '@/lib/agent-api';
import { acceptUploadedVideo, formMeta } from '@/lib/upload-video';
import { apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Import a finished video (made with Claude Code, Higgsfield, Kling, CapCut, a phone…):
 * multipart "file" (≤ 100 MB) or JSON { url } (public https, ≤ 1 GB). Poll /api/projects/:id.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try { return NextResponse.json(await agentImportUrl(user, await req.json().catch(() => ({})))); } catch (e) { return apiError(e); }
  }
  if (!rateLimit(`import:${user.id}`, 30, 60 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    return NextResponse.json({ id: await acceptUploadedVideo(user.id, file, formMeta(fd)), status: 'rendering' });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: ['too_large', 'not_a_video'].includes(m) ? m : 'failed' }, { status: 400 });
  }
}
