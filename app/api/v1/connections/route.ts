import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { agentAccounts } from '@/lib/agent-api';
import { apiError, needAuth } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = await apiUser(req); if (!u) return needAuth();
  try { return NextResponse.json(await agentAccounts(u)); } catch (e) { return apiError(e); }
}
