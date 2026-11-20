import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { acceptUploadedVideo, formMeta } from '@/lib/upload-video';
import { needAuth } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Multipart upload of a finished video: file=@video.mp4 [title, description, hashtags, source]. Max 100 MB. */
export async function POST(req: Request) {
  const u = await apiUser(req); if (!u) return needAuth();
  if (!rateLimit(`import:${u.id}`, 30, 60 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'bad_request', message: 'field "file" is required' }, { status: 400 });
    const id = await acceptUploadedVideo(u.id, file, formMeta(fd));
    return NextResponse.json({ id, status: 'rendering' }, { status: 202 });
  } catch (e) {
    const m = (e as Error).message;
    if (m === 'too_large' || m === 'not_a_video') return NextResponse.json({ error: m }, { status: 400 });
    console.error('[v1 upload]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
