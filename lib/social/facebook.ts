import axios from 'axios';
import { redirectUri, getAccount, type SocialAccount } from './accounts';
import { publicVideoUrl } from '../media-link';

/**
 * Facebook Pages video publishing (Graph API). The user logs in with Facebook, Synthia keeps the access token
 * of their first Page (Page tokens obtained from a long-lived user token do not expire), and posts videos with
 * POST /{page-id}/videos (file_url = signed temporary link). Permissions: pages_show_list,
 * pages_read_engagement, pages_manage_posts.
 */

const V = process.env.FACEBOOK_API_VERSION || 'v27.0';
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts';

export function facebookAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID ?? '', redirect_uri: redirectUri('facebook'), state,
    scope: SCOPES, response_type: 'code',
  });
  return `https://www.facebook.com/${V}/dialog/oauth?${q}`;
}

export async function facebookConnect(userId: number, code: string): Promise<SocialAccount> {
  const id = process.env.FACEBOOK_APP_ID ?? '', secret = process.env.FACEBOOK_APP_SECRET ?? '';
  const short = await axios.get(`https://graph.facebook.com/${V}/oauth/access_token`, {
    params: { client_id: id, client_secret: secret, redirect_uri: redirectUri('facebook'), code }, timeout: 20_000 });
  const long = await axios.get(`https://graph.facebook.com/${V}/oauth/access_token`, {
    params: { grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.data.access_token }, timeout: 20_000 });
  const userToken = long.data?.access_token ?? short.data.access_token;
  const pages = await axios.get(`https://graph.facebook.com/${V}/me/accounts`, {
    params: { fields: 'id,name,access_token,picture{url},tasks', access_token: userToken }, timeout: 20_000 });
  const page = (pages.data?.data ?? []).find((p: { tasks?: string[] }) => !p.tasks || p.tasks.includes('CREATE_CONTENT'));
  if (!page) throw new Error('no_page');
  return {
    userId, platform: 'facebook', externalId: page.id, displayName: page.name ?? null,
    avatarUrl: page.picture?.data?.url ?? null, accessToken: page.access_token, refreshToken: null,
    expiresAt: null, refreshExpiresAt: null, scope: SCOPES,
  };
}

export async function facebookPublish(userId: number, p: { projectId: string; title: string; description: string }): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  const acc = await getAccount(userId, 'facebook');
  if (!acc) return { success: false, error: 'not_connected' };
  try {
    const r = await axios.post(`https://graph-video.facebook.com/${V}/${acc.externalId}/videos`, new URLSearchParams({
      file_url: publicVideoUrl(p.projectId), title: p.title.slice(0, 250), description: p.description.slice(0, 5000),
      access_token: acc.accessToken,
    }), { timeout: 300_000 });
    const id = r.data?.id;
    return id ? { success: true, postId: id, url: `https://www.facebook.com/${acc.externalId}/videos/${id}` } : { success: false, error: 'upload_failed' };
  } catch (e) {
    const err = e as { response?: { status?: number; data?: { error?: { code?: number } } } };
    const code = err.response?.data?.error?.code;
    if (code === 190 || code === 200 || err.response?.status === 401) return { success: false, error: 'reconnect_required' };
    console.error('[facebook] publish failed', err.response?.data ?? e);
    return { success: false, error: 'upload_failed' };
  }
}
