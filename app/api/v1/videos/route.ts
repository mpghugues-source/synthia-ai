import { NextResponse } from 'next/server';
import { apiUser } from '@/lib/api-auth';
import { agentListVideos, agentImportUrl } from '@/lib/agent-api';
import { apiError, needAuth } from '@/lib/api-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET: the user's videos. POST {url, title?, description?, hashtags?, source?}: import from a public https URL. */
export async function GET(req: Request) {
  const u = await apiUser(req); if (!u) return needAuth();
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 20);
  try { return NextResponse.json({ videos: await agentListVideos(u, limit) }); } catch (e) { return apiError(e); }
}
export async function POST(req: Request) {
  const u = await apiUser(req); if (!u) return needAuth();
  try { return NextResponse.json(await agentImportUrl(u, await req.json().catch(() => ({}))), { status: 202 }); } catch (e) { return apiError(e); }
}
