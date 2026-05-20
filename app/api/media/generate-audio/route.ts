import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { generateScript } from '@/lib/ollama';
import { synthesizeAndSave } from '@/lib/xtts';
import { generateMusic, type MusicMood } from '@/lib/musicgen';
import { enqueue } from '@/lib/queue';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      topic,
      niche = 'généraliste',
      duration = 60,
      platform = 'YouTube Shorts',
      lang = 'fr',
      mood = 'energetic',
      bpm = 120,
      speakerWavName,
      autoRender = false,
      platforms = ['youtube'],
    } = body;

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }

    const jobId     = uuidv4();
    const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
    const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');
    const samplesDir = process.env.VOICE_SAMPLES_DIR ?? path.join(process.cwd(), 'voice-samples');

    [uploadDir, outputDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));

    // 1 — Generate script with Ollama
    const { script, title, hashtags } = await generateScript({
      topic, niche, duration, platform,
      lang: lang as 'fr' | 'en',
    });

    // 2 — Synthesize voiceover with XTTS
    const voicePath = path.join(outputDir, `voice_${jobId}.wav`);
    const speakerWavPath = speakerWavName
      ? path.join(samplesDir, speakerWavName)
      : undefined;

    await synthesizeAndSave(
      { text: script, speakerWavPath, language: lang },
      voicePath
    );

    // 3 — Generate background music with MusicGen
    const musicPath = await generateMusic({
      mood: mood as MusicMood,
      bpm,
      duration,
      outputDir,
      jobId,
    });

    const result = { jobId, title, script, hashtags, voicePath, musicPath };

    // 4 — Optionally queue the video render job
    if (autoRender) {
      enqueue('render_video', {
        jobId,
        title,
        script,
        hashtags,
        voicePath,
        musicPath,
        duration,
        platforms,
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[generate-audio]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
