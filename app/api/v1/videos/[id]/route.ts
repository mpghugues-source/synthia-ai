import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { agentGetVideo } from '@/lib/agent-api';
import { apiError, needAuth } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await apiUser(req); if (!u) return needAuth();
  try { return NextResponse.json(await agentGetVideo(u, (await params).id)); } catch (e) { return apiError(e); }
}
