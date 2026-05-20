import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { renderVideo } from '@/lib/ffmpeg-studio';
import { enqueue, getJob } from '@/lib/queue';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      jobId,
      voicePath,
      musicPath,
      title,
      script,
      hashtags = [],
      duration = 60,
      resolution = '1080x1920',
      musicVolume = 0.2,
      platforms = ['youtube'],
      async: isAsync = false,
    } = body;

    if (!jobId || !voicePath) {
      return NextResponse.json({ error: 'jobId and voicePath are required' }, { status: 400 });
    }

    if (!fs.existsSync(voicePath)) {
      return NextResponse.json({ error: `Voice file not found: ${voicePath}` }, { status: 404 });
    }

    const outputDir  = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');
    const stockDir   = process.env.STOCK_CLIPS_DIR ?? path.join(process.cwd(), 'stock');
    const outputPath = path.join(outputDir, `render_${jobId}.mp4`);

    // Async mode: push to queue, return immediately
    if (isAsync) {
      const job = enqueue('render_video', {
        jobId, voicePath, musicPath, title, script, hashtags, duration,
        resolution, musicVolume, platforms, outputPath,
      });
      return NextResponse.json({ success: true, queued: true, queueJobId: job.id });
    }

    // Sync mode: render immediately (blocks until done)
    const resolvedMusicPath = musicPath && fs.existsSync(musicPath) ? musicPath : undefined;
    const finalPath = await renderVideo({
      voiceoverPath: voicePath,
      musicPath: resolvedMusicPath,
      stockClipsDir: stockDir,
      outputPath,
      subtitleText: script,
      duration,
      musicVolume,
      resolution: resolution as '1080x1920' | '1920x1080' | '1080x1080',
    });

    // Queue social publishing after render
    if (platforms.length > 0) {
      enqueue('publish_social', {
        videoPath: finalPath,
        title,
        description: title,
        hashtags,
        platforms,
      });
    }

    return NextResponse.json({ success: true, data: { outputPath: finalPath, jobId } });
  } catch (err) {
    console.error('[render-video]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('jobId');
  if (!id) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: job });
}
