import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { synthesizeLongText } from '@/lib/tts-chunker';
import { renderVideo } from '@/lib/ffmpeg-studio';
import { generateImagesFromScript, stabilityEnabled } from '@/lib/stability';
import { generateWordSRT } from '@/lib/whisper-sync';
import { generateMusic, type MusicMood } from '@/lib/musicgen';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { OUTPUT_DIR, safeMediaPath, safeMediaPaths, isValidJobId } from '@/lib/paths';
import { createProject, getProject, updateProject, hasQuota, quotaExceeded, getBrandKit } from '@/lib/projects';
import { finalizeRender } from '@/lib/render-jobs';

export const runtime = 'nodejs';
export const maxDuration = 600;

interface PipelineParams {
  text: string; voiceId?: string; lang: string; title: string | null;
  imagePaths: string[]; resolution: string; musicVolume: number;
  generateImages: boolean; imageCount: number; imageStyle?: string;
  addMusic: boolean; musicMood: string; musicBpm: number; uploadedMusicPath?: string;
}

async function runPipeline(params: PipelineParams, jobId: string, outputDir: string, userId: number): Promise<void> {
  const {
    text, voiceId, lang, title, imagePaths, resolution, musicVolume,
    generateImages, imageCount, imageStyle,
    addMusic, musicMood, musicBpm, uploadedMusicPath,
  } = params;

  const voiceInitPath = path.join(outputDir, `voice_${jobId}.mp3`);
  const outputPath    = path.join(outputDir, `render_${jobId}.mp4`);

  // Start music generation immediately in background (fire-and-forget).
  // MusicGen takes 30-120 min on CPU — never block the video render on it.
  if (addMusic && !uploadedMusicPath) {
    const estimatedDuration = Math.max(30, Math.ceil(text.split(/\s+/).length / 2.5));
    console.log(`[narration] starting music in background (mood=${musicMood}, ~${estimatedDuration}s)`);
    generateMusic({ mood: musicMood as MusicMood, bpm: musicBpm, duration: estimatedDuration, outputDir, jobId })
      .then(() => console.log(`[narration] music ready for job ${jobId}`))
      .catch((e) => console.warn(`[narration] music failed for job ${jobId}:`, e));
  }

  // Voice synthesis
  const ttsResult = await synthesizeLongText({ text, voiceId, language: lang, outputPath: voiceInitPath, outputDir, jobId });
  const { duration, outputPath: voicePath } = ttsResult;
  console.log(`[narration] voice done, engine=${ttsResult.engine}, duration=${duration.toFixed(1)}s`);

  // Word-level SRT via Groq Whisper
  let srtPath: string | undefined;
  if (process.env.GROQ_API_KEY && duration < 1500) {
    try {
      const r = await generateWordSRT(voicePath, path.join(outputDir, `voice_${jobId}.srt`));
      srtPath = r.srtPath;
    } catch (e) { console.warn('[narration] whisper failed:', e); }
  }

  // AI images (Stability AI)
  let finalImagePaths = [...imagePaths];
  if (generateImages && stabilityEnabled() && finalImagePaths.length === 0) {
    try {
      finalImagePaths = await generateImagesFromScript({
        script: text, title, resolution: resolution as '1080x1920' | '1920x1080' | '1080x1080',
        outputDir, jobId, count: imageCount, style: imageStyle,
      });
    } catch (e) { console.warn('[narration] image gen failed:', e); }
  }

  // Render video WITHOUT music — add music later when ready (see add-narration-music route)
  const brand = await getBrandKit(userId);
  const finalPath = await renderVideo({
    captionStyle: brand.captionStyle,
    watermark: brand.watermark,
    voiceoverPath: voicePath,
    imagePaths: finalImagePaths,
    outputPath,
    subtitleText: !srtPath && text.length <= 8000 ? text : undefined,
    srtPath,
    duration: Math.ceil(duration),
    musicPath: uploadedMusicPath,  // only use uploaded music immediately (it's already on disk)
    musicVolume,
    resolution: resolution as '1080x1920' | '1920x1080' | '1080x1080',
  });

  const meta = {
    jobId, title,
    script: text.slice(0, 500) + (text.length > 500 ? '…' : ''),
    hashtags: [], duration: Math.ceil(duration), platforms: [],
    hasImages: finalImagePaths.length > 0, hasClips: false, mode: 'narration',
    whisperSync: Boolean(srtPath),
    musicPending: addMusic && !uploadedMusicPath,  // MusicGen still running
    musicVolume,
    videoReady: true,
    outputPath: finalPath, fileSize: fs.statSync(finalPath).size,
    renderedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputDir, `render_${jobId}.json`), JSON.stringify({ ...meta, userId }, null, 2));
  await finalizeRender(jobId, userId, finalPath, { duration: Math.ceil(duration) });
}

function launchAsync(params: PipelineParams, jobId: string, outputDir: string, userId: number): void {
  runPipeline(params, jobId, outputDir, userId).catch(async (e) => {
    console.error(`[narration-bg] pipeline failed for job ${jobId}:`, e);
    const msg = e instanceof Error ? e.message : String(e);
    void msg;
    try { fs.writeFileSync(path.join(outputDir, `narr_${jobId}_error.txt`), 'Narration failed, please retry.'); } catch { /* ignore */ }
    await updateProject(jobId, { status: 'failed', error: 'La narration a échoué. Réessayez. / Narration failed, please retry.' }).catch(() => {});
  });
}

/**
 * Always runs in the background (a long text easily exceeds the 100 s a request may take through
 * Cloudflare); the browser polls /api/media/narration-status/:jobId.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`gen-narr:${user.id}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    const body = await req.json();
    const {
      text, voiceId, lang = 'fr', title = null,
      resolution = '1080x1920', musicVolume = 0.15,
      generateImages = false, imageCount = 4, imageStyle,
      addMusic = false, musicMood = 'calm', musicBpm = 90,
    } = body;

    if (typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (text.length > 200_000) {
      return NextResponse.json({ error: 'text is too long (200 000 characters max)' }, { status: 400 });
    }
    if (!(await hasQuota(user.id))) {
      return NextResponse.json(quotaExceeded(req.headers.get('x-lang')), { status: 402 });
    }

    const outputDir = OUTPUT_DIR;
    fs.mkdirSync(outputDir, { recursive: true });
    let jobId: string;
    if (body.jobId !== undefined && body.jobId !== null && body.jobId !== '') {
      if (!isValidJobId(body.jobId) || !(await getProject(body.jobId, user.id))) return notFound();
      jobId = body.jobId;
    } else {
      jobId = randomUUID().replace(/-/g, '').slice(0, 12);
      await createProject({ id: jobId, userId: user.id, mode: 'narration' });
    }
    await updateProject(jobId, {
      mode: 'narration', title: typeof title === 'string' ? title.slice(0, 255) : null,
      script: text.trim(), resolution: String(resolution), status: 'rendering', error: null,
    });
    console.log(`[narration] jobId=${jobId}, user=${user.id}, chars=${text.trim().length}`);

    const params: PipelineParams = {
      text: text.trim(), voiceId, lang, title,
      imagePaths: safeMediaPaths(body.imagePaths), resolution, musicVolume,
      generateImages, imageCount: Math.min(Number(imageCount) || 4, 8), imageStyle,
      addMusic, musicMood, musicBpm, uploadedMusicPath: safeMediaPath(body.uploadedMusicPath) ?? undefined,
    };

    launchAsync(params, jobId, outputDir, user.id);
    return NextResponse.json({
      success: true,
      data: { jobId, voiceReady: false, videoReady: false, musicPending: addMusic },
    });
  } catch (err) {
    console.error('[generate-narration]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
