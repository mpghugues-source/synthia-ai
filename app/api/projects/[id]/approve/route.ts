import { NextResponse } from 'next/server';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { getProject, updateProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The creator approves (or withdraws approval of) a video after watching it and reading the quality report.
 * Browser session only: an API token / MCP client (an AI) can never approve.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (/^Bearer\s/i.test(req.headers.get('authorization') ?? '')) return NextResponse.json({ error: 'human_only' }, { status: 403 });
  const user = await currentUser(); if (!user) return unauthorized();
  const { id } = await params;
  const p = await getProject(id, user.id);
  if (!p) return notFound();
  const b = await req.json().catch(() => ({}));
  if (b.approve === false) {
    await updateProject(p.id, { approvedAt: null });
    return NextResponse.json({ project: await getProject(p.id, user.id) });
  }
  if (p.status !== 'ready') return NextResponse.json({ error: 'not_ready' }, { status: 409 });
  if (!['passed', 'manual'].includes(p.qaStatus ?? '')) {
    return NextResponse.json({ error: 'qa_not_passed', message: 'Le contrôle qualité doit être à 100 % avant l’approbation.' }, { status: 409 });
  }
  await updateProject(p.id, { approvedAt: new Date().toISOString() });
  return NextResponse.json({ project: await getProject(p.id, user.id) });
}
