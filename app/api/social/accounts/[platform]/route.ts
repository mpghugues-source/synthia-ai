import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { CONNECTABLE, getAccount, deleteAccount, type ConnectablePlatform } from '@/lib/social/accounts';
import { youtubeRevoke } from '@/lib/social/youtube';
import { tiktokRevoke } from '@/lib/social/tiktok';

export const runtime = 'nodejs';

/** Disconnect: revoke Synthia's access at the platform, then delete the stored tokens. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { platform } = await params;
  if (!CONNECTABLE.includes(platform as ConnectablePlatform)) return notFound();
  const p = platform as ConnectablePlatform;
  const acc = await getAccount(user.id, p).catch(() => null);
  if (acc && p === 'youtube') await youtubeRevoke(acc);
  else if (acc && p === 'tiktok') await tiktokRevoke(acc);
  await deleteAccount(user.id, p);
  return NextResponse.json({ success: true });
}
