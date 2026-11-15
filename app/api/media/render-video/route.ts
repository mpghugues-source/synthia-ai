import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { safeMediaPath, safeMediaPaths, isValidJobId } from '@/lib/paths';
import { getProject, updateProject, hasQuota, quotaExceeded, CAPTION_STYLES, type CaptionStyle } from '@/lib/projects';
import { startRender } from '@/lib/render-jobs';

export const runtime = 'nodejs';

const RESOLUTIONS = ['1080x1920', '1920x1080', '1080x1080'] as const;

/**
 * Starts a render in the background and returns at once; poll GET /api/projects/:jobId
 * until status is "ready" (or "failed").
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`render:${user.id}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    const body = await req.json();
    const {
      jobId, title, script, hashtags = [], duration = 60, resolution = '1080x1920',
      musicVolume = 0.2, captionStyle,
    } = body;

    if (!isValidJobId(jobId)) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    const project = await getProject(jobId, user.id);
    if (!project) return notFound();
    if (project.status === 'rendering') {
      return NextResponse.json({ success: true, queued: true, data: { jobId } });
    }
    if (!(await hasQuota(user.id))) {
      return NextResponse.json(quotaExceeded(req.headers.get('x-lang')), { status: 402 });
    }

    const voicePath = safeMediaPath(body.voicePath);
    if (!voicePath || !path.basename(voicePath).includes(jobId)) {
      return NextResponse.json({ error: 'Voice file not found' }, { status: 404 });
    }
    const musicPath = safeMediaPath(body.musicPath) ?? undefined;
    const imagePaths = safeMediaPaths(body.imagePaths);
    const clipPaths = safeMediaPaths(body.clipPaths, 20);
    const res = (RESOLUTIONS as readonly string[]).includes(resolution) ? resolution : '1080x1920';
    const dur = Math.min(Math.max(Number(duration) || 60, 5), 600);
    const style = (CAPTION_STYLES as string[]).includes(captionStyle) ? captionStyle as CaptionStyle : undefined;

    await updateProject(jobId, {
      title: typeof title === 'string' ? title.slice(0, 255) : project.title,
      script: typeof script === 'string' ? script : project.script,
      hashtags: Array.isArray(hashtags) ? hashtags.slice(0, 30).map(String) : project.hashtags,
      resolution: res, duration: dur, status: 'rendering',
    });

    startRender({
      projectId: jobId,
      userId: user.id,
      options: {
        voiceoverPath: voicePath, musicPath, imagePaths, clipPaths,
        stockClipsDir: process.env.STOCK_CLIPS_DIR ?? path.join(process.cwd(), 'stock'),
        subtitleText: typeof script === 'string' ? script : project.script ?? undefined,
        duration: dur, musicVolume: Math.min(Math.max(Number(musicVolume) || 0.2, 0), 1),
        resolution: res as typeof RESOLUTIONS[number], captionStyle: style,
      },
      meta: { title, script, hashtags, duration: dur, mode: project.mode },
    });

    return NextResponse.json({ success: true, queued: true, data: { jobId } });
  } catch (err) {
    console.error('[render-video]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
