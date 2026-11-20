import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { agentPublish } from '@/lib/agent-api';
import { apiError, needAuth } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST {videoId, platforms[], caption?, youtubePrivacy?, tiktokPrivacy?, scheduledAt?} */
export async function POST(req: Request) {
  const u = await apiUser(req); if (!u) return needAuth();
  try { return NextResponse.json(await agentPublish(u, await req.json().catch(() => ({}))), { status: 202 }); } catch (e) { return apiError(e); }
}
