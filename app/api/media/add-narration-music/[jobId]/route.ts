import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject, updateProject } from '@/lib/projects';
import { addMusicToVideo } from '@/lib/ffmpeg-studio';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!isValidJobId(jobId) || !(await getProject(jobId, user.id))) return notFound();
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');

  try {
    const body = await req.json().catch(() => ({}));
    const musicVolume = Math.min(Math.max(Number(body.musicVolume ?? 0.15) || 0.15, 0), 1);

    const metaPath  = path.join(outputDir, `render_${jobId}.json`);
    const musicPath = path.join(outputDir, `music_${jobId}.mp3`);

    if (!fs.existsSync(metaPath)) {
      return NextResponse.json({ error: 'Narration job not found' }, { status: 404 });
    }
    if (!fs.existsSync(musicPath)) {
      return NextResponse.json({ error: 'Music not ready yet' }, { status: 409 });
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    if (!meta.videoReady || !fs.existsSync(meta.outputPath)) {
      return NextResponse.json({ error: 'Video not ready' }, { status: 409 });
    }

    const outputPath = meta.outputPath.replace(/\.mp4$/, '_music.mp4');
    await addMusicToVideo({ videoPath: meta.outputPath, musicPath, outputPath, musicVolume });

    // Update metadata so subsequent status checks reflect the music-mixed path
    meta.outputPath = outputPath;
    meta.musicPending = false;
    meta.musicMixed = true;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    await updateProject(jobId, { outputFile: path.basename(outputPath), fileSize: fs.statSync(outputPath).size });

    return NextResponse.json({ success: true, data: { outputPath } });
  } catch (err) {
    console.error('[add-narration-music]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
