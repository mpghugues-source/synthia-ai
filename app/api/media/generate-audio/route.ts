import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { generateScript } from '@/lib/ollama';
import { generateScriptGroq } from '@/lib/groq';
import { synthesizeAndSave } from '@/lib/xtts';
import { synthesizeElevenLabs } from '@/lib/elevenlabs';
import { generateMusic, type MusicMood } from '@/lib/musicgen';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized } from '@/lib/session';
import { createProject, hasQuota, quotaExceeded } from '@/lib/projects';

export const runtime = 'nodejs';
export const maxDuration = 300;

const useGroq       = () => Boolean(process.env.GROQ_API_KEY);
const useElevenLabs = () => Boolean(process.env.ELEVENLABS_API_KEY);


const SCRIPT_LANGS = ['fr', 'en', 'es', 'pt', 'sw', 'de', 'it', 'ar'];

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`gen-audio:${user.id}`, 12, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
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
      elevenlabsVoiceId,
      resolution = '1080x1920',
      hook,
      tone,
    } = body;

    if (typeof topic !== 'string' || !topic.trim() || topic.length > 500) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 });
    }
    if (!SCRIPT_LANGS.includes(lang)) {
      return NextResponse.json({ error: 'unsupported language' }, { status: 400 });
    }
    if (!(await hasQuota(user.id))) {
      return NextResponse.json(quotaExceeded(req.headers.get('x-lang')), { status: 402 });
    }

    const jobId      = uuidv4();
    const uploadDir  = process.env.UPLOAD_DIR  ?? path.join(process.cwd(), 'uploads');
    const outputDir  = process.env.OUTPUT_DIR  ?? path.join(process.cwd(), 'output');
    const samplesDir = process.env.VOICE_SAMPLES_DIR ?? path.join(process.cwd(), 'voice-samples');

    [uploadDir, outputDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));

    // 1 — Generate script (Groq if key available, else Ollama)
    const scriptFn = useGroq()
      ? () => generateScriptGroq({ topic, niche, duration, platform, lang, hook, tone })
      : () => generateScript({ topic, niche, duration, platform, lang: lang === 'fr' ? 'fr' : 'en' });

    console.log(`[generate-audio] script engine: ${useGroq() ? 'Groq' : 'Ollama'}`);
    const { script, title, hashtags } = await scriptFn();
    await createProject({
      id: jobId, userId: user.id, mode: 'ai', title, script, hashtags,
      resolution: String(resolution), duration: Number(duration) || 60,
    });

    // 2 — TTS: ElevenLabs (sync, fast) → XTTS fallback (async, slow CPU)
    let voicePath  = path.join(outputDir, `voice_${jobId}.mp3`);
    let voiceReady = false;
    let ttsEngine  = 'xtts';
    const speakerWavPath = typeof speakerWavName === 'string' && /^[\w.-]+\.wav$/.test(speakerWavName)
      ? path.join(samplesDir, speakerWavName) : undefined;

    if (useElevenLabs()) {
      try {
        console.log('[generate-audio] TTS engine: ElevenLabs');
        await synthesizeElevenLabs({ text: script, language: lang, voiceId: elevenlabsVoiceId, outputPath: voicePath });
        voiceReady = true;
        ttsEngine  = 'elevenlabs';
        console.log(`[generate-audio] voice ready: ${voicePath}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[generate-audio] ElevenLabs failed (${msg}), falling back to XTTS`);
        try { if (fs.existsSync(voicePath)) fs.unlinkSync(voicePath); } catch { /* ignore */ }
        voicePath = path.join(outputDir, `voice_${jobId}.wav`);
      }
    }

    if (!voiceReady) {
      // XTTS — fire-and-forget (CPU takes 10-30 min)
      console.log('[generate-audio] TTS engine: XTTS (async)');
      const _voicePath = voicePath;
      synthesizeAndSave({ text: script, speakerWavPath, language: lang }, _voicePath)
        .then(() => console.log(`[generate-audio] voice ready (XTTS): ${_voicePath}`))
        .catch((e: unknown) => console.error('[generate-audio] xtts failed:', e));
    }

    // 3 — MusicGen background (always async)
    const musicPath = path.join(outputDir, `music_${jobId}.mp3`);
    generateMusic({ mood: mood as MusicMood, bpm, duration, outputDir, jobId })
      .then(() => console.log(`[generate-audio] music ready: ${musicPath}`))
      .catch((e: unknown) => console.error('[generate-audio] musicgen failed:', e));

    const result = {
      jobId, title, script, hashtags,
      voicePath, musicPath,
      voiceReady,
      engine: { script: useGroq() ? 'groq' : 'ollama', tts: ttsEngine },
    };

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[generate-audio]', err);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
