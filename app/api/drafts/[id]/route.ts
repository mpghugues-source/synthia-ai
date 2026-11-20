import { NextResponse } from 'next/server';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { getDraft, deleteDraft, isDraftId } from '@/lib/drafts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return unauthorized();
  const { id } = await params;
  const d = isDraftId(id) ? await getDraft(user.id, id) : null;
  return d ? NextResponse.json({ draft: d }) : notFound();
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) return unauthorized();
  const { id } = await params;
  return NextResponse.json({ success: isDraftId(id) && (await deleteDraft(user.id, id)) });
}
