import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { agentGenerate } from '@/lib/agent-api';
import { apiError } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Studio: generate an AI video with the user's own key (Kling, Veo, Replicate). Poll /api/projects/:id. */
export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  try { return NextResponse.json(await agentGenerate(user, await req.json().catch(() => ({})))); } catch (e) { return apiError(e); }
}
