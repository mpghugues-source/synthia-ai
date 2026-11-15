import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { tiktokCreatorInfo } from '@/lib/social/tiktok';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Creator nickname + allowed privacy levels, shown before posting (TikTok requirement). */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try {
    const info = await tiktokCreatorInfo(user.id);
    return info ? NextResponse.json({ info }) : NextResponse.json({ error: 'not_connected' }, { status: 404 });
  } catch (e) {
    console.error('[tiktok creator]', e);
    // Not 502: Cloudflare would replace the body with its own error page.
    return NextResponse.json({ error: 'reconnect_required' }, { status: 409 });
  }
}
