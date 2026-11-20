import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { CONNECTABLE, APP_URL, readStateCookie, saveAccount, type ConnectablePlatform } from '@/lib/social/accounts';
import { youtubeConnect } from '@/lib/social/youtube';
import { tiktokConnect } from '@/lib/social/tiktok';
import { instagramConnect } from '@/lib/social/instagram';
import { facebookConnect } from '@/lib/social/facebook';
import { xConnect } from '@/lib/social/x';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OAuth redirect target: checks the state, stores the account, returns to the accounts page. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const q = req.nextUrl.searchParams;
  const p = platform as ConnectablePlatform;
  const state = readStateCookie(req.cookies.get('synthia_oauth')?.value, q.get('state'), p);
  const lang = state?.lang ?? 'fr';
  const back = (query: string) => {
    const res = NextResponse.redirect(`${APP_URL}/${lang}/dashboard/accounts?${query}`);
    res.cookies.set('synthia_oauth', '', { path: '/api/social/callback', maxAge: 0, secure: APP_URL.startsWith('https:'), httpOnly: true });
    return res;
  };

  if (!CONNECTABLE.includes(p)) return back('error=unsupported');
  const user = await currentUser();
  // The round-trip must come back to the same signed-in user that started it.
  if (!state || !user || user.id !== state.userId) return back(`error=state&platform=${p}`);
  if (q.get('error')) return back(`error=denied&platform=${p}`);
  const code = q.get('code');
  if (!code) return back(`error=denied&platform=${p}`);

  try {
    const account = p === 'youtube' ? await youtubeConnect(user.id, code)
      : p === 'tiktok' ? await tiktokConnect(user.id, code)
      : p === 'instagram' ? await instagramConnect(user.id, code)
      : p === 'facebook' ? await facebookConnect(user.id, code)
      : await xConnect(user.id, code, state.nonce);
    await saveAccount(account);
    return back(`connected=${p}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    console.error(`[social ${p}] connect failed`, msg);
    const reason = ['no_channel', 'missing_scope', 'no_page'].includes(msg) ? msg : 'failed';
    return back(`error=${reason}&platform=${p}`);
  }
}
