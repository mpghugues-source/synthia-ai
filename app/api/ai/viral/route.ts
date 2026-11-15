import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { viralTool, LANG_NAMES, type ViralTool } from '@/lib/groq';
import { getBrandKit } from '@/lib/projects';
import { rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOLS: ViralTool[] = ['hooks', 'titles', 'captions', 'ideas', 'rewrite', 'translate', 'hashtags'];

/** Viral Lab: fast Groq text tools (hooks, titles, captions, ideas, rewrite, translate, hashtags). */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI not configured' }, { status: 501 });
  if (!rateLimit(`viral:${user.id}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  if (!TOOLS.includes(b.tool)) return NextResponse.json({ error: 'unknown tool' }, { status: 400 });
  if (typeof b.input !== 'string' || !b.input.trim()) return NextResponse.json({ error: 'input is required' }, { status: 400 });
  const lang = LANG_NAMES[b.lang] ? b.lang : 'fr';
  try {
    const brand = await getBrandKit(user.id);
    const result = await viralTool({
      tool: b.tool, input: b.input, lang,
      platform: typeof b.platform === 'string' ? b.platform : undefined,
      targetLang: LANG_NAMES[b.targetLang] ? b.targetLang : undefined,
      style: typeof b.style === 'string' ? b.style : undefined,
      tone: brand.tone ?? undefined,
    });
    return NextResponse.json({ result });
  } catch (e) {
    console.error('[viral]', e);
    return NextResponse.json({ error: 'AI request failed, please retry.' }, { status: 503 });
  }
}
