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

  // Check both wav (XTTS) and mp3 (ElevenLabs)
  const wavPath = path.join(outputDir, `voice_${jobId}.wav`);
  const mp3Path = path.join(outputDir, `voice_${jobId}.mp3`);

  const wavReady = fs.existsSync(wavPath);
  const mp3Ready = fs.existsSync(mp3Path);
  const ready    = wavReady || mp3Ready;
  const voicePath = wavReady ? wavPath : mp3Ready ? mp3Path : null;

  return NextResponse.json({ ready, voicePath });
}
