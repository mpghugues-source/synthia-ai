import axios from 'axios';
import { redirectUri, getAccount, updateTokens, type SocialAccount } from './accounts';
import { publicVideoUrl } from '../media-link';

/**
 * Instagram Reels through the "Instagram API with Instagram Login" (professional accounts: creator or business).
 * Docs checked 2026-11-19: authorize www.instagram.com/oauth/authorize, short-lived token api.instagram.com,
 * long-lived token (60 days) graph.instagram.com/access_token, container POST /{IG_ID}/media (media_type=REELS,
 * video_url public), status_code polling, POST /{IG_ID}/media_publish.
 */

const V = process.env.INSTAGRAM_API_VERSION || 'v27.0';
const GRAPH = 'https://graph.instagram.com';
const SCOPES = 'instagram_business_basic,instagram_business_content_publish';

export function instagramAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? '', redirect_uri: redirectUri('instagram'),
    response_type: 'code', scope: SCOPES, state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export async function instagramConnect(userId: number, code: string): Promise<SocialAccount> {
  const short = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? '', client_secret: process.env.INSTAGRAM_APP_SECRET ?? '',
    grant_type: 'authorization_code', redirect_uri: redirectUri('instagram'), code: code.replace(/#_$/, ''),
  }), { timeout: 20_000 });
  const t = Array.isArray(short.data?.data) ? short.data.data[0] : short.data;
  if (!t?.access_token) throw new Error('failed');
  const perms = String(t.permissions ?? '');
  if (perms && !perms.includes('instagram_business_content_publish')) throw new Error('missing_scope');
  const long = await axios.get(`${GRAPH}/access_token`, {
    params: { grant_type: 'ig_exchange_token', client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: t.access_token }, timeout: 20_000 });
  const token = long.data?.access_token ?? t.access_token;
  const me = await axios.get(`${GRAPH}/${V}/me`, { params: { fields: 'user_id,username,profile_picture_url', access_token: token }, timeout: 20_000 });
  return {
    userId, platform: 'instagram', externalId: String(me.data.user_id ?? me.data.id ?? t.user_id),
    displayName: me.data.username ? `@${me.data.username}` : null, avatarUrl: me.data.profile_picture_url ?? null,
    accessToken: token, refreshToken: null,
    expiresAt: new Date(Date.now() + Number(long.data?.expires_in ?? 3600) * 1000), refreshExpiresAt: null, scope: SCOPES,
  };
}

/** Long-lived tokens last 60 days; refresh when less than 10 days remain (token must be at least 24 h old). */
async function freshToken(acc: SocialAccount): Promise<string> {
  if (acc.expiresAt && acc.expiresAt.getTime() - Date.now() < 10 * 86400_000 && acc.expiresAt.getTime() > Date.now()) {
    try {
      const r = await axios.get(`${GRAPH}/refresh_access_token`, { params: { grant_type: 'ig_refresh_token', access_token: acc.accessToken }, timeout: 20_000 });
      if (r.data?.access_token) {
        await updateTokens(acc.userId, 'instagram', { accessToken: r.data.access_token, expiresAt: new Date(Date.now() + Number(r.data.expires_in ?? 0) * 1000) });
        return r.data.access_token;
      }
    } catch { /* keep the current token */ }
  }
  return acc.accessToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function instagramPublish(userId: number, p: { projectId: string; caption: string }): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  const acc = await getAccount(userId, 'instagram');
  if (!acc) return { success: false, error: 'not_connected' };
  if (acc.expiresAt && acc.expiresAt < new Date()) return { success: false, error: 'reconnect_required' };
  const token = await freshToken(acc);
  try {
    const c = await axios.post(`${GRAPH}/${V}/${acc.externalId}/media`, {
      media_type: 'REELS', video_url: publicVideoUrl(p.projectId), caption: p.caption.slice(0, 2200), share_to_feed: true,
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 60_000 });
    const container = c.data?.id;
    if (!container) return { success: false, error: 'upload_failed' };
    // Instagram downloads and processes the video: poll (docs: about once a minute, here every 15 s, max 15 min)
    for (let i = 0; i < 60; i++) {
      await sleep(15_000);
      const s = await axios.get(`${GRAPH}/${V}/${container}`, { params: { fields: 'status_code,status' }, headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 });
      const code = s.data?.status_code;
      if (code === 'FINISHED') break;
      if (code === 'ERROR' || code === 'EXPIRED') {
        console.error('[instagram] container', s.data);
        return { success: false, error: 'instagram_processing_failed' };
      }
      if (i === 59) return { success: false, error: 'instagram_timeout' };
    }
    const pub = await axios.post(`${GRAPH}/${V}/${acc.externalId}/media_publish`, { creation_id: container },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 60_000 });
    const id = pub.data?.id;
    let url: string | undefined;
    try {
      const m = await axios.get(`${GRAPH}/${V}/${id}`, { params: { fields: 'permalink' }, headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 });
      url = m.data?.permalink;
    } catch { /* link is optional */ }
    return { success: true, postId: id, url };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { code?: number; message?: string } } } };
    const code = err.response?.data?.error?.code;
    if (err.response?.status === 401 || code === 190) return { success: false, error: 'reconnect_required' };
    if (code === 9 || code === 4) return { success: false, error: 'instagram_rate_limit' };
    console.error('[instagram] publish failed', err.response?.data ?? e);
    return { success: false, error: 'upload_failed' };
  }
}
