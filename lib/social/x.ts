import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import { redirectUri, getAccount, updateTokens, pkceChallenge, pkceVerifier, type SocialAccount } from './accounts';

/**
 * X (Twitter) with OAuth 2.0 + PKCE and the v2 chunked media upload (docs checked 2026-11-19):
 * POST /2/media/upload/initialize (JSON) → /{id}/append (multipart, ≤ 5 MB chunks) → /{id}/finalize,
 * then GET /2/media/upload?command=STATUS until processing succeeds, and POST /2/tweets with media_ids.
 * Scopes: tweet.read tweet.write users.read media.write offline.access.
 */

const API = 'https://api.x.com/2';
const SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
const CHUNK = 4 * 1024 * 1024;

const basic = () => process.env.X_CLIENT_SECRET
  ? { Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}` }
  : {};

export function xAuthUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: 'code', client_id: process.env.X_CLIENT_ID ?? '', redirect_uri: redirectUri('twitter'),
    scope: SCOPES, state, code_challenge: pkceChallenge(state), code_challenge_method: 'S256',
  });
  return `https://x.com/i/oauth2/authorize?${q}`;
}

export async function xConnect(userId: number, code: string, nonce: string): Promise<SocialAccount> {
  const tok = await axios.post(`${API}/oauth2/token`, new URLSearchParams({
    code, grant_type: 'authorization_code', client_id: process.env.X_CLIENT_ID ?? '',
    redirect_uri: redirectUri('twitter'), code_verifier: pkceVerifier(nonce),
  }), { headers: basic(), timeout: 20_000 });
  const t = tok.data;
  if (!String(t.scope ?? '').includes('media.write')) throw new Error('missing_scope');
  const me = await axios.get(`${API}/users/me`, { params: { 'user.fields': 'profile_image_url,username,name' },
    headers: { Authorization: `Bearer ${t.access_token}` }, timeout: 20_000 });
  const u = me.data?.data;
  return {
    userId, platform: 'twitter', externalId: u.id, displayName: u.username ? `@${u.username}` : u.name ?? null,
    avatarUrl: u.profile_image_url ?? null, accessToken: t.access_token, refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Number(t.expires_in ?? 7200) * 1000), refreshExpiresAt: null, scope: t.scope ?? SCOPES,
  };
}

async function freshToken(acc: SocialAccount): Promise<string | null> {
  if (acc.expiresAt && acc.expiresAt.getTime() - Date.now() > 120_000) return acc.accessToken;
  if (!acc.refreshToken) return null;
  const r = await axios.post(`${API}/oauth2/token`, new URLSearchParams({
    grant_type: 'refresh_token', refresh_token: acc.refreshToken, client_id: process.env.X_CLIENT_ID ?? '',
  }), { headers: basic(), timeout: 20_000 }).catch(() => null);
  if (!r?.data?.access_token) return null;
  await updateTokens(acc.userId, 'twitter', { accessToken: r.data.access_token, refreshToken: r.data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Number(r.data.expires_in ?? 7200) * 1000) });
  return r.data.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function xPublish(userId: number, p: { videoPath: string; text: string }): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  const acc = await getAccount(userId, 'twitter');
  if (!acc) return { success: false, error: 'not_connected' };
  const token = await freshToken(acc);
  if (!token) return { success: false, error: 'reconnect_required' };
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const size = fs.statSync(p.videoPath).size;
    const init = await axios.post(`${API}/media/upload/initialize`,
      { media_type: 'video/mp4', total_bytes: size, media_category: 'tweet_video' }, { headers: auth, timeout: 30_000 });
    const id = init.data?.data?.id;
    if (!id) return { success: false, error: 'upload_failed' };
    const fd = fs.openSync(p.videoPath, 'r');
    try {
      for (let i = 0, off = 0; off < size; i++, off += CHUNK) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - off));
        fs.readSync(fd, buf, 0, buf.length, off);
        const form = new FormData();
        form.append('segment_index', String(i));
        form.append('media', buf, { filename: 'chunk.mp4', contentType: 'application/octet-stream' });
        await axios.post(`${API}/media/upload/${id}/append`, form, { headers: { ...auth, ...form.getHeaders() }, timeout: 120_000, maxBodyLength: Infinity });
      }
    } finally { fs.closeSync(fd); }
    const fin = await axios.post(`${API}/media/upload/${id}/finalize`, null, { headers: auth, timeout: 60_000 });
    let info = fin.data?.data?.processing_info;
    for (let n = 0; info && info.state !== 'succeeded' && n < 120; n++) {
      if (info.state === 'failed') return { success: false, error: 'x_processing_failed' };
      await sleep(Math.max(1, Number(info.check_after_secs ?? 2)) * 1000);
      const st = await axios.get(`${API}/media/upload`, { params: { command: 'STATUS', media_id: id }, headers: auth, timeout: 20_000 });
      info = st.data?.data?.processing_info;
    }
    const post = await axios.post(`${API}/tweets`, { text: p.text.slice(0, 280), media: { media_ids: [String(id)] } }, { headers: auth, timeout: 30_000 });
    const pid = post.data?.data?.id;
    return { success: true, postId: pid, url: pid ? `https://x.com/i/status/${pid}` : undefined };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: unknown } };
    if (err.response?.status === 401) return { success: false, error: 'reconnect_required' };
    if (err.response?.status === 403) return { success: false, error: 'x_forbidden' };      // plan / duration limits
    if (err.response?.status === 429) return { success: false, error: 'x_rate_limit' };
    console.error('[x] publish failed', err.response?.data ?? e);
    return { success: false, error: 'upload_failed' };
  }
}
