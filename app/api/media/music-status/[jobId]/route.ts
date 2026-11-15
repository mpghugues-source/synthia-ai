import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { isValidJobId } from '@/lib/paths';
import { getProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!isValidJobId(jobId) || !(await getProject(jobId, user.id))) return notFound();
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');
  const musicPath = path.join(outputDir, `music_${jobId}.mp3`);
  const ready     = fs.existsSync(musicPath);
  return NextResponse.json({ ready, musicPath: ready ? musicPath : null });
}
