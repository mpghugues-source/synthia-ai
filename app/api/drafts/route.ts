import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { listDrafts, saveDraft } from '@/lib/drafts';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Recent Studio projects (autosaved). */
export async function GET(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  return NextResponse.json({ drafts: await listDrafts(user.id, Number(req.nextUrl.searchParams.get('limit') ?? 30)) });
}

/** Create or update: { id?, title, mode, state, projectId? } */
export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  if (!rateLimit(`draft:${user.id}`, 240, 10 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    return NextResponse.json({ id: await saveDraft(user.id, await req.json()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message === 'too_large' ? 'too_large' : 'failed' }, { status: 400 });
  }
}
