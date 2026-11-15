import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { OUTPUT_DIR, UPLOAD_DIR, isValidJobId } from '@/lib/paths';
import { getProject, updateProject, deleteProject } from '@/lib/projects';
import { sanitizePlatforms, sanitizeOptions } from '@/lib/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function owned(ctx: Ctx) {
  const user = await currentUser();
  if (!user) return { error: unauthorized() };
  const { id } = await ctx.params;
  if (!isValidJobId(id)) return { error: notFound() };
  const project = await getProject(id, user.id);
  if (!project) return { error: notFound() };
  return { user, project };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const r = await owned(ctx);
  if ('error' in r) return r.error;
  return NextResponse.json({ project: r.project });
}

/**
 * Edit title/hashtags, or schedule publication:
 * { schedule: { at: ISO date, platforms: [...] } } — or { schedule: null } to cancel.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const r = await owned(ctx);
  if ('error' in r) return r.error;
  const body = await req.json().catch(() => ({}));
  const fields: Parameters<typeof updateProject>[1] = {};
  if (typeof body.title === 'string') fields.title = body.title.slice(0, 255);
  if (Array.isArray(body.hashtags)) fields.hashtags = body.hashtags.slice(0, 30).map((h: unknown) => String(h).slice(0, 60));

  if (body.schedule === null) {
    fields.scheduledAt = null;
    fields.publishStatus = 'none';
  } else if (body.schedule) {
    const at = new Date(body.schedule.at);
    const platforms = sanitizePlatforms(body.schedule.platforms);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    if (!platforms.length) return NextResponse.json({ error: 'platforms are required' }, { status: 400 });
    if (r.project.status !== 'ready') return NextResponse.json({ error: 'video not ready' }, { status: 409 });
    fields.scheduledAt = at.toISOString();
    fields.platforms = platforms;
    fields.publishOptions = sanitizeOptions(body.schedule.options);
    fields.publishStatus = 'scheduled';
  }
  await updateProject(r.project.id, fields);
  return NextResponse.json({ project: await getProject(r.project.id, r.user.id) });
}

/** Delete the project and every file produced for it. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const r = await owned(ctx);
  if ('error' in r) return r.error;
  const id = r.project.id;
  for (const dir of [OUTPUT_DIR, UPLOAD_DIR]) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.includes(id)) fs.rmSync(path.join(dir, f), { force: true });
      }
    } catch { /* directory missing */ }
  }
  await deleteProject(id, r.user.id);
  return NextResponse.json({ success: true });
}
