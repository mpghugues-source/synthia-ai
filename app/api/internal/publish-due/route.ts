import { NextRequest, NextResponse } from 'next/server';
import { isInternalRequest } from '@/lib/session';
import { dueScheduledProjects, updateProject } from '@/lib/projects';
import { publishProject, sanitizePlatforms, sanitizeOptions } from '@/lib/publish';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Called every minute by cron.js: publishes the scheduled projects whose time has come. */
export async function POST(req: NextRequest) {
  if (!isInternalRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const due = await dueScheduledProjects();
  const done: { id: string; ok: boolean }[] = [];
  for (const p of due) {
    try {
      const results = await publishProject(p, sanitizePlatforms(p.platforms), sanitizeOptions(p.publishOptions));
      done.push({ id: p.id, ok: results.some((r) => r.success) });
    } catch (e) {
      await updateProject(p.id, {
        publishStatus: 'failed',
        publishResults: [{ success: false, error: 'upload_failed' }],
      });
      done.push({ id: p.id, ok: false });
    }
  }
  return NextResponse.json({ processed: done });
}
