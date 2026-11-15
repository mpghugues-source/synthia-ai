import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!(await currentUser())) return unauthorized();
  if (!/^[a-f0-9]{12}$/.test(jobId)) return notFound();
  const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output');

  const errorPath = path.join(outputDir, `trends_${jobId}_error.txt`);
  if (fs.existsSync(errorPath)) {
    return NextResponse.json({ ready: true, error: fs.readFileSync(errorPath, 'utf-8') });
  }

  const resultPath = path.join(outputDir, `trends_${jobId}.json`);
  if (fs.existsSync(resultPath)) {
    const { suggestions } = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    return NextResponse.json({ ready: true, suggestions });
  }

  return NextResponse.json({ ready: false });
}
