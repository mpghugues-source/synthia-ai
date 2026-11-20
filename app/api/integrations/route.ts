import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { listConnections, saveConnection, setModels, deleteConnection, PROVIDERS, type Provider } from '@/lib/ai/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isProvider = (p: unknown): p is Provider => PROVIDERS.includes(p as Provider);

/** The user's AI connections (never the keys). */
export async function GET() {
  const user = await currentUser(); if (!user) return unauthorized();
  return NextResponse.json({ connections: await listConnections(user.id) });
}

/** Connect a provider: { provider, key } — the key is checked with the provider before being stored encrypted. */
export async function POST(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  if (!rateLimit(`aikey:${user.id}`, 20, 10 * 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  if (!isProvider(b.provider) || typeof b.key !== 'string') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    return NextResponse.json({ connection: await saveConnection(user.id, b.provider, b.key) });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m === 'invalid_key' ? 'invalid_key' : 'provider_unreachable' }, { status: m === 'invalid_key' ? 400 : 503 });
  }
}

/** Choose models: { provider, textModel?, videoModel? } */
export async function PATCH(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (!isProvider(b.provider)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  try {
    await setModels(user.id, b.provider, typeof b.textModel === 'string' ? b.textModel : undefined, typeof b.videoModel === 'string' ? b.videoModel : undefined);
    return NextResponse.json({ connections: await listConnections(user.id) });
  } catch { return NextResponse.json({ error: 'not_connected' }, { status: 404 }); }
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser(); if (!user) return unauthorized();
  const p = req.nextUrl.searchParams.get('provider');
  if (!isProvider(p)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  await deleteConnection(user.id, p);
  return NextResponse.json({ success: true });
}
