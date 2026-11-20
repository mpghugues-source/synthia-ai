import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { createToken, listTokens, revokeToken } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Personal access tokens for Claude Code / MCP clients / scripts. The token is shown once, at creation. */
export async function GET() {
  const user = await currentUser(); if (!user) return unauthorized();
  return NextResponse.json({ tokens: await listTokens(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  if (!rateLimit(`token:${user.id}`, 10, 60 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  try {
    const { token, info } = await createToken(user.id, typeof b.name === 'string' ? b.name : 'Claude Code');
    return NextResponse.json({ token, info });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message === 'too_many_tokens' ? 'too_many_tokens' : 'failed' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  return NextResponse.json({ success: await revokeToken(user.id, id) });
}
