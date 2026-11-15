import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { CONNECTABLE, listPublicAccounts, platformConfigured } from '@/lib/social/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The user's connected accounts (no tokens) and which platforms can be connected on this server. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    accounts: await listPublicAccounts(user.id),
    available: Object.fromEntries(CONNECTABLE.map((p) => [p, platformConfigured(p)])),
  });
}
