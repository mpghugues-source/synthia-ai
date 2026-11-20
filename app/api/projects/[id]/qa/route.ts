import { NextResponse } from 'next/server';
import path from 'path';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { getProject, getBrandKit } from '@/lib/projects';
import { OUTPUT_DIR } from '@/lib/paths';
import { rateLimit } from '@/lib/rate-limit';
import { qaExisting } from '@/lib/qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** (Re)run the quality control on a ready video, in the background. Poll GET /api/projects/:id. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return unauthorized();
  if (!rateLimit(`qa:${user.id}`, 10, 30 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const p = await getProject((await params).id, user.id);
  if (!p) return notFound();
  if (p.status !== 'ready' || !p.outputFile) return NextResponse.json({ error: 'not_ready' }, { status: 409 });
  if (p.qaStatus === 'running') return NextResponse.json({ queued: true });
  const lang = (await getBrandKit(user.id).catch(() => null))?.defaultLang ?? 'fr';
  const script = p.mode === 'import' || p.mode === 'generated' ? null : p.script;
  void qaExisting(p.id, path.join(OUTPUT_DIR, path.basename(p.outputFile)), script, lang).catch(() => {});
  return NextResponse.json({ queued: true });
}
