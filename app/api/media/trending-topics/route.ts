import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized } from '@/lib/session';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { getTrendingTopics } from '@/lib/trends';
import { suggestViralTopicsGroq } from '@/lib/groq';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Les vraies tendances (flux Google Trends) sont renvoyées tout de suite —
 * c'est rapide. La partie IA (suggestions adaptées à la niche) tourne en
 * arrière-plan et interroge Groq (cloud, quelques secondes) : mesuré en
 * pratique, l'équivalent en local via Ollama (CPU) dépasse les 10 minutes
 * puis time out sur ce serveur pour un volume de texte comparable — pas
 * une alternative viable, donc pas de fallback silencieux dessus ici.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`trends:${user.id}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    const { niche, market = 'US', lang = 'fr' } = await req.json();
    if (!niche) return NextResponse.json({ error: 'niche required' }, { status: 400 });
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 501 });
    }

    const trends = await getTrendingTopics(market);

    const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const jobId = randomUUID().replace(/-/g, '').slice(0, 12);

    suggestViralTopicsGroq({ niche, market, trends, lang: lang as 'fr' | 'en' })
      .then((suggestions) => {
        fs.writeFileSync(path.join(outputDir, `trends_${jobId}.json`), JSON.stringify({ suggestions }));
      })
      .catch((e) => {
        fs.writeFileSync(
          path.join(outputDir, `trends_${jobId}_error.txt`),
          e instanceof Error ? e.message : String(e)
        );
      });

    return NextResponse.json({ success: true, data: { jobId, trends: trends.slice(0, 15) } });
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
