import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { proofreadText, LANG_NAMES } from '@/lib/groq';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 90;

const MAX_CHARS = 60_000;

/** Automatic spelling/grammar correction of a script or narration text. */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 501 });
  if (!rateLimit(`proofread:${user.id}`, 30, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  if (typeof b.text !== 'string' || !b.text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (b.text.length > MAX_CHARS) return NextResponse.json({ error: 'text_too_long', max: MAX_CHARS }, { status: 413 });
  try {
    const out = await proofreadText(b.text, LANG_NAMES[b.lang] ? b.lang : 'fr');
    return NextResponse.json(out);
  } catch (e) {
    console.error('[proofread]', e);
    return NextResponse.json({ error: 'AI request failed, please retry.' }, { status: 502 });
  }
}
