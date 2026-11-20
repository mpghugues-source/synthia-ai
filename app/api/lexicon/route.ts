import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { listLexicon, saveLexicon, deleteLexicon } from '@/lib/qa/lexicon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Voice lexicon: how the synthetic voice must pronounce a word (subtitles keep the real spelling). */
export async function GET() {
  const user = await currentUser(); if (!user) return unauthorized();
  return NextResponse.json({ entries: await listLexicon(user.id) });
}
export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  try { await saveLexicon(user.id, String(b.lang ?? ''), String(b.word ?? ''), String(b.spoken ?? '')); }
  catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }); }
  return NextResponse.json({ entries: await listLexicon(user.id) });
}
export async function DELETE(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  await deleteLexicon(user.id, Number(req.nextUrl.searchParams.get('id')));
  return NextResponse.json({ entries: await listLexicon(user.id) });
}
