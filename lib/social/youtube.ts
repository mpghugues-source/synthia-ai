import fs from 'fs';
import axios from 'axios';
import { google } from 'googleapis';
import { redirectUri, getAccount, updateTokens, type SocialAccount } from './accounts';

// youtube.upload to publish; youtube.readonly to show which channel is connected.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

export function youtubeAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID ?? '',
    redirect_uri: redirectUri('youtube'),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',          // refresh token, so scheduled posts work while the user is away
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Exchange the authorization code and read the user's channel. */
export async function youtubeConnect(userId: number, code: string): Promise<SocialAccount> {
  const tok = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    code, client_id: process.env.YOUTUBE_CLIENT_ID ?? '', client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
    redirect_uri: redirectUri('youtube'), grant_type: 'authorization_code',
  }), { timeout: 20_000 });
  const { access_token, refresh_token, expires_in, scope } = tok.data;
  if (!String(scope ?? '').includes('youtube.upload')) throw new Error('missing_scope');

  const ch = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet', mine: 'true' }, headers: { Authorization: `Bearer ${access_token}` }, timeout: 20_000,
  });
  const item = ch.data.items?.[0];
  if (!item) throw new Error('no_channel');
  return {
    userId, platform: 'youtube', externalId: item.id, displayName: item.snippet?.title ?? null,
    avatarUrl: item.snippet?.thumbnails?.default?.url ?? null, accessToken: access_token,
    refreshToken: refresh_token ?? null, expiresAt: new Date(Date.now() + (expires_in ?? 3600) * 1000),
    refreshExpiresAt: null, scope: scope ?? null,
  };
}

export async function youtubeRevoke(acc: SocialAccount): Promise<void> {
  await axios.post('https://oauth2.googleapis.com/revoke', new URLSearchParams({
    token: acc.refreshToken ?? acc.accessToken,
  }), { timeout: 10_000 }).catch(() => {});
}

export type YoutubePrivacy = 'public' | 'unlisted' | 'private';

export async function youtubePublish(userId: number, p: {
  videoPath: string; title: string; description: string; hashtags: string[]; privacy: YoutubePrivacy;
  vertical: boolean; durationSec: number | null; lang: string;
}): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  const acc = await getAccount(userId, 'youtube');
  if (!acc) return { success: false, error: 'not_connected' };
  const auth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, redirectUri('youtube'));
  auth.setCredentials({
    access_token: acc.accessToken, refresh_token: acc.refreshToken ?? undefined,
    expiry_date: acc.expiresAt ? acc.expiresAt.getTime() : undefined,
  });
  // Keep refreshed tokens (googleapis refreshes transparently).
  auth.on('tokens', (t) => {
    if (t.access_token) {
      void updateTokens(userId, 'youtube', {
        accessToken: t.access_token, refreshToken: t.refresh_token ?? null,
        expiresAt: t.expiry_date ? new Date(t.expiry_date) : null,
      }).catch(() => {});
    }
  });
  const short = p.vertical && (p.durationSec ?? 0) <= 180;
  const tags = p.hashtags.map((h) => h.replace(/^#/, '')).filter(Boolean).slice(0, 15);
  let title = p.title.replace(/[<>]/g, '').slice(0, 100) || 'Synthia';
  if (short && !/#shorts/i.test(title) && title.length <= 92) title += ' #Shorts';
  try {
    const yt = google.youtube({ version: 'v3', auth });
    const res = await yt.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: `${p.description}\n\n${p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`.replace(/[<>]/g, '').slice(0, 4900),
          tags, categoryId: '22', defaultLanguage: p.lang,
        },
        status: { privacyStatus: p.privacy, selfDeclaredMadeForKids: false },
      },
      media: { body: fs.createReadStream(p.videoPath) },
    });
    const id = res.data.id ?? '';
    return { success: true, postId: id, url: short ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}` };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { message?: string; errors?: { reason?: string }[] } } }; message?: string };
    const reason = err.response?.data?.error?.errors?.[0]?.reason;
    if (err.response?.status === 401) return { success: false, error: 'reconnect_required' };
    if (reason === 'uploadLimitExceeded' || reason === 'quotaExceeded') return { success: false, error: 'youtube_quota' };
    if (/invalid_grant|invalid_client|unauthorized_client/.test(String(err.message))) return { success: false, error: 'reconnect_required' };
    if (reason === 'youtubeSignupRequired') return { success: false, error: 'no_channel' };
    console.error('[youtube] upload failed', err.response?.data ?? err.message);
    return { success: false, error: 'upload_failed' };
  }
}
