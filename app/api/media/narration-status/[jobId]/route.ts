import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject } from '@/lib/projects';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!isValidJobId(jobId) || !(await getProject(jobId, user.id))) return notFound();
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');

  // Pipeline error
  const errorPath = path.join(outputDir, `narr_${jobId}_error.txt`);
  if (fs.existsSync(errorPath)) {
    return NextResponse.json({ error: fs.readFileSync(errorPath, 'utf-8'), voiceReady: false, videoReady: false });
  }

  // Music file (MusicGen fire-and-forget)
  const musicPath = path.join(outputDir, `music_${jobId}.mp3`);
  const musicReady = fs.existsSync(musicPath);

  // Completed video metadata
  const metaPath = path.join(outputDir, `render_${jobId}.json`);
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.videoReady && fs.existsSync(meta.outputPath)) {
        return NextResponse.json({
          voiceReady: true,
          videoReady: true,
          outputPath: meta.outputPath,
          duration: meta.duration,
          whisperSync: meta.whisperSync ?? false,
          hasImages: meta.hasImages ?? false,
          musicPending: meta.musicPending && !musicReady,
          musicReady,
          musicVolume: meta.musicVolume ?? 0.15,
        });
      }
    } catch { /* corrupt JSON — fall through */ }
  }

  // Voice file present but render not yet started
  const wavPath = path.join(outputDir, `voice_${jobId}.wav`);
  const mp3Path = path.join(outputDir, `voice_${jobId}.mp3`);
  const voiceReady = fs.existsSync(wavPath) || fs.existsSync(mp3Path);

  return NextResponse.json({ voiceReady, videoReady: false, musicReady });
}
