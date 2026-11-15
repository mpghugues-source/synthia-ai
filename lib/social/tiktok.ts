import fs from 'fs';
import axios from 'axios';
import { redirectUri, getAccount, updateTokens, type SocialAccount } from './accounts';

const API = 'https://open.tiktokapis.com/v2';
// video.upload = send to the user's TikTok inbox as a draft; video.publish = direct post.
const SCOPES = process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload,video.publish';

const creds = () => ({ client_key: process.env.TIKTOK_CLIENT_KEY ?? '', client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '' });

export function tiktokAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_key: creds().client_key, scope: SCOPES, response_type: 'code',
    redirect_uri: redirectUri('tiktok'), state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

interface TokenResponse {
  access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number;
  open_id: string; scope: string; error?: string; error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await axios.post(`${API}/oauth/token/`, new URLSearchParams({ ...creds(), ...params }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20_000,
  });
  if (res.data.error) throw new Error(`tiktok_token_${res.data.error}`);
  return res.data;
}

export async function tiktokConnect(userId: number, code: string): Promise<SocialAccount> {
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri('tiktok') });
  const info = await axios.get(`${API}/user/info/`, {
    params: { fields: 'open_id,avatar_url,display_name' },
    headers: { Authorization: `Bearer ${t.access_token}` }, timeout: 20_000,
  });
  const u = info.data?.data?.user ?? {};
  return {
    userId, platform: 'tiktok', externalId: t.open_id, displayName: u.display_name ?? null,
    avatarUrl: u.avatar_url ?? null, accessToken: t.access_token, refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    refreshExpiresAt: new Date(Date.now() + t.refresh_expires_in * 1000), scope: t.scope,
  };
}

export async function tiktokRevoke(acc: SocialAccount): Promise<void> {
  await axios.post(`${API}/oauth/revoke/`, new URLSearchParams({ ...creds(), token: acc.accessToken }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000,
  }).catch(() => {});
}

/** Access token valid for at least another minute (refreshing it if needed), or null. */
async function validToken(userId: number): Promise<{ token: string; acc: SocialAccount } | null> {
  const acc = await getAccount(userId, 'tiktok');
  if (!acc) return null;
  if (acc.expiresAt && acc.expiresAt.getTime() > Date.now() + 60_000) return { token: acc.accessToken, acc };
  if (!acc.refreshToken) return null;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: acc.refreshToken });
  await updateTokens(userId, 'tiktok', {
    accessToken: t.access_token, refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    refreshExpiresAt: new Date(Date.now() + t.refresh_expires_in * 1000),
  });
  return { token: t.access_token, acc };
}

export interface CreatorInfo {
  nickname: string; username: string; avatarUrl: string; privacyOptions: string[];
  commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDurationSec: number;
  canDirectPost: boolean;
}

/** TikTok requires showing the creator's nickname and their allowed privacy levels before posting. */
export async function tiktokCreatorInfo(userId: number): Promise<CreatorInfo | null> {
  const v = await validToken(userId);
  if (!v) return null;
  const canDirectPost = (v.acc.scope ?? '').includes('video.publish');
  if (!canDirectPost) {
    return { nickname: v.acc.displayName ?? '', username: '', avatarUrl: v.acc.avatarUrl ?? '', privacyOptions: [],
      commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDurationSec: 600, canDirectPost };
  }
  const res = await axios.post(`${API}/post/publish/creator_info/query/`, {}, {
    headers: { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json; charset=UTF-8' }, timeout: 20_000,
  });
  const d = res.data?.data ?? {};
  return {
    nickname: d.creator_nickname ?? v.acc.displayName ?? '', username: d.creator_username ?? '',
    avatarUrl: d.creator_avatar_url ?? v.acc.avatarUrl ?? '', privacyOptions: d.privacy_level_options ?? [],
    commentDisabled: Boolean(d.comment_disabled), duetDisabled: Boolean(d.duet_disabled),
    stitchDisabled: Boolean(d.stitch_disabled), maxDurationSec: Number(d.max_video_post_duration_sec ?? 600),
    canDirectPost,
  };
}

export interface TiktokOptions {
  mode: 'direct' | 'draft';
  privacy?: string;                 // one of creator_info.privacy_level_options (direct mode)
  disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean;
  brandOrganic?: boolean;           // promotes the creator's own business
  brandedContent?: boolean;         // paid partnership (cannot be private)
}

function chunking(size: number) {
  const MB = 1024 * 1024;
  if (size <= 5 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) }; // the last chunk takes the remainder
}

export async function tiktokPublish(userId: number, p: { videoPath: string; caption: string; options: TiktokOptions }):
  Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const v = await validToken(userId);
    if (!v) return { success: false, error: 'not_connected' };
    const headers = { Authorization: `Bearer ${v.token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    const size = fs.statSync(p.videoPath).size;
    const { chunkSize, count } = chunking(size);
    const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count };

    let init;
    if (p.options.mode === 'direct') {
      const info = await tiktokCreatorInfo(userId);
      if (!info?.canDirectPost) return { success: false, error: 'tiktok_direct_not_allowed' };
      const privacy = p.options.privacy ?? '';
      if (!info.privacyOptions.includes(privacy)) return { success: false, error: 'tiktok_privacy_required' };
      if (p.options.brandedContent && privacy === 'SELF_ONLY') return { success: false, error: 'tiktok_branded_private' };
      init = await axios.post(`${API}/post/publish/video/init/`, {
        post_info: {
          title: p.caption.slice(0, 2200), privacy_level: privacy,
          disable_comment: info.commentDisabled || Boolean(p.options.disableComment),
          disable_duet: info.duetDisabled || Boolean(p.options.disableDuet),
          disable_stitch: info.stitchDisabled || Boolean(p.options.disableStitch),
          video_cover_timestamp_ms: 1000,
          brand_organic_toggle: Boolean(p.options.brandOrganic),
          brand_content_toggle: Boolean(p.options.brandedContent),
        },
        source_info,
      }, { headers, timeout: 30_000 });
    } else {
      init = await axios.post(`${API}/post/publish/inbox/video/init/`, { source_info }, { headers, timeout: 30_000 });
    }
    const { publish_id, upload_url } = init.data?.data ?? {};
    if (!publish_id || !upload_url) return { success: false, error: `tiktok_${init.data?.error?.code ?? 'init_failed'}` };

    const fd = fs.openSync(p.videoPath, 'r');
    try {
      for (let i = 0; i < count; i++) {
        const start = i * chunkSize;
        const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
        const buf = Buffer.alloc(end - start + 1);
        fs.readSync(fd, buf, 0, buf.length, start);
        await axios.put(upload_url, buf, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length), 'Content-Range': `bytes ${start}-${end}/${size}` },
          maxBodyLength: Infinity, timeout: 120_000,
        });
      }
    } finally { fs.closeSync(fd); }

    // TikTok processes the video asynchronously: follow it for up to ~2 minutes.
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const st = await axios.post(`${API}/post/publish/status/fetch/`, { publish_id }, { headers, timeout: 20_000 }).catch(() => null);
      const status = st?.data?.data?.status;
      if (status === 'FAILED') return { success: false, postId: publish_id, error: `tiktok_${st?.data?.data?.fail_reason ?? 'failed'}` };
      if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') {
        return { success: true, postId: publish_id, ...(status === 'SEND_TO_USER_INBOX' ? { url: 'tiktok://inbox' } : {}) };
      }
    }
    return { success: true, postId: publish_id }; // still processing on TikTok's side
  } catch (e) {
    const err = e as { response?: { data?: { error?: { code?: string } } }; message?: string };
    const code = err.response?.data?.error?.code;
    console.error('[tiktok] publish failed', err.response?.data ?? err.message);
    if (code === 'access_token_invalid' || code === 'scope_not_authorized') return { success: false, error: 'reconnect_required' };
    if (code === 'spam_risk_too_many_posts' || code === 'rate_limit_exceeded') return { success: false, error: 'tiktok_rate_limited' };
    if (code === 'unaudited_client_can_only_post_to_private_accounts') return { success: false, error: 'tiktok_unaudited' };
    return { success: false, error: code ? `tiktok_${code}` : 'upload_failed' };
  }
}
