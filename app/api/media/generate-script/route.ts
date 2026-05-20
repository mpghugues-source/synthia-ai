import { NextRequest, NextResponse } from 'next/server';
import { generateScript } from '@/lib/ollama';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { topic, niche, duration = 60, platform = 'YouTube Shorts', lang = 'fr' } = await req.json();
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 });

    const result = await generateScript({
      topic, niche: niche ?? topic, duration, platform,
      lang: lang as 'fr' | 'en',
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 });
  }
}
