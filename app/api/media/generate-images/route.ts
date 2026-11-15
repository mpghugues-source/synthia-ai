import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject } from '@/lib/projects';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { generateImagesFromScript, stabilityEnabled } from '@/lib/stability';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Whether AI image generation is available on this server. */
export async function GET() {
  if (!(await currentUser())) return unauthorized();
  return NextResponse.json({ enabled: stabilityEnabled() });
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`images:${user.id}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  if (!stabilityEnabled()) {
    return NextResponse.json({ error: 'images_disabled' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const {
      script,
      title,
      resolution = '1080x1920',
      count = 4,
      style,
      jobId,
    } = body;

    if (!script?.trim()) {
      return NextResponse.json({ error: 'script is required' }, { status: 400 });
    }

    const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const owned = isValidJobId(jobId) && (await getProject(jobId, user.id));
    const id = owned ? jobId : randomUUID().replace(/-/g, '').slice(0, 12);

    const imagePaths = await generateImagesFromScript({
      script,
      title,
      resolution,
      outputDir,
      jobId: id,
      count: Math.min(Number(count), 8),
      style,
    });

    return NextResponse.json({ success: true, imagePaths, count: imagePaths.length });
  } catch (err) {
    console.error('[generate-images]', err);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
