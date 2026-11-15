import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { CONNECTABLE, APP_URL, platformConfigured, makeStateCookie, type ConnectablePlatform } from '@/lib/social/accounts';
import { youtubeAuthUrl } from '@/lib/social/youtube';
import { tiktokAuthUrl } from '@/lib/social/tiktok';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Start connecting a social account: redirect to the platform's consent screen. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const lang = req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'fr';
  const back = (q: string) => NextResponse.redirect(`${APP_URL}/${lang}/dashboard/accounts?${q}`);
  const user = await currentUser();
  if (!user) return NextResponse.redirect(`${APP_URL}/${lang}/login`);
  if (!CONNECTABLE.includes(platform as ConnectablePlatform)) return back('error=unsupported');
  const p = platform as ConnectablePlatform;
  if (!platformConfigured(p)) return back(`error=not_configured&platform=${p}`);

  const { nonce, cookie } = makeStateCookie(user.id, p, lang);
  const res = NextResponse.redirect(p === 'youtube' ? youtubeAuthUrl(nonce) : tiktokAuthUrl(nonce));
  res.cookies.set('synthia_oauth', cookie, {
    httpOnly: true, secure: APP_URL.startsWith('https:'), sameSite: 'lax', path: '/api/social/callback', maxAge: 600,
  });
  return res;
}
