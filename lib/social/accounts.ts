import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2';
import pool from '../db';

/**
 * Social accounts connected by each user through OAuth. Access/refresh tokens are stored
 * encrypted (AES-256-GCM, key SOCIAL_TOKEN_KEY in /etc/synthia/app.env) and never sent to browsers.
 */

export type ConnectablePlatform = 'youtube' | 'tiktok';
export const CONNECTABLE: ConnectablePlatform[] = ['youtube', 'tiktok'];

export const APP_URL = (process.env.NEXTAUTH_URL || 'https://synthia.ikelyane.com').replace(/\/$/, '');
export const redirectUri = (p: ConnectablePlatform) => `${APP_URL}/api/social/callback/${p}`;

/** Whether the platform's developer app credentials are configured on the server. */
export function platformConfigured(p: ConnectablePlatform): boolean {
  if (p === 'youtube') return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

// ── Encryption ────────────────────────────────────────────────────────────────

function key(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_KEY ?? '';
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('SOCIAL_TOKEN_KEY must be 32 bytes (base64)');
  return k;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split('.');
  if (v !== 'v1') throw new Error('unknown token format');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

// ── Storage ───────────────────────────────────────────────────────────────────

export interface SocialAccount {
  userId: number;
  platform: ConnectablePlatform;
  externalId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  scope: string | null;
}

/** What the browser may see about a connected account. */
export interface PublicAccount {
  platform: ConnectablePlatform; displayName: string | null; avatarUrl: string | null;
  connectedAt: string; needsReconnect: boolean;
}

interface Row extends RowDataPacket {
  user_id: number; platform: ConnectablePlatform; external_id: string; display_name: string | null;
  avatar_url: string | null; access_token_enc: string; refresh_token_enc: string | null;
  expires_at: Date | null; refresh_expires_at: Date | null; scope: string | null; created_at: Date;
}

function fromRow(r: Row): SocialAccount {
  return {
    userId: r.user_id, platform: r.platform, externalId: r.external_id, displayName: r.display_name,
    avatarUrl: r.avatar_url, accessToken: decrypt(r.access_token_enc),
    refreshToken: r.refresh_token_enc ? decrypt(r.refresh_token_enc) : null,
    expiresAt: r.expires_at, refreshExpiresAt: r.refresh_expires_at, scope: r.scope,
  };
}

export async function saveAccount(a: SocialAccount): Promise<void> {
  await pool.query(
    `INSERT INTO social_accounts (user_id, platform, external_id, display_name, avatar_url, access_token_enc,
       refresh_token_enc, expires_at, refresh_expires_at, scope)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE external_id = VALUES(external_id), display_name = VALUES(display_name),
       avatar_url = VALUES(avatar_url), access_token_enc = VALUES(access_token_enc),
       refresh_token_enc = COALESCE(VALUES(refresh_token_enc), refresh_token_enc),
       expires_at = VALUES(expires_at), refresh_expires_at = VALUES(refresh_expires_at), scope = VALUES(scope)`,
    [a.userId, a.platform, a.externalId, a.displayName?.slice(0, 255) ?? null, a.avatarUrl?.slice(0, 1024) ?? null,
     encrypt(a.accessToken), a.refreshToken ? encrypt(a.refreshToken) : null, a.expiresAt, a.refreshExpiresAt,
     a.scope?.slice(0, 512) ?? null]);
}

export async function getAccount(userId: number, platform: ConnectablePlatform): Promise<SocialAccount | null> {
  const [rows] = await pool.query<Row[]>(
    'SELECT * FROM social_accounts WHERE user_id = ? AND platform = ? LIMIT 1', [userId, platform]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listPublicAccounts(userId: number): Promise<PublicAccount[]> {
  const [rows] = await pool.query<Row[]>('SELECT * FROM social_accounts WHERE user_id = ?', [userId]);
  return rows.map((r) => ({
    platform: r.platform, displayName: r.display_name, avatarUrl: r.avatar_url,
    connectedAt: new Date(r.created_at).toISOString(),
    needsReconnect: Boolean(r.refresh_expires_at && new Date(r.refresh_expires_at) < new Date())
      || (!r.refresh_token_enc && Boolean(r.expires_at && new Date(r.expires_at) < new Date())),
  }));
}

export async function deleteAccount(userId: number, platform: ConnectablePlatform): Promise<void> {
  await pool.query('DELETE FROM social_accounts WHERE user_id = ? AND platform = ?', [userId, platform]);
}

export async function updateTokens(userId: number, platform: ConnectablePlatform, t: {
  accessToken: string; refreshToken?: string | null; expiresAt: Date | null; refreshExpiresAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `UPDATE social_accounts SET access_token_enc = ?, expires_at = ?,
       refresh_token_enc = COALESCE(?, refresh_token_enc), refresh_expires_at = COALESCE(?, refresh_expires_at)
     WHERE user_id = ? AND platform = ?`,
    [encrypt(t.accessToken), t.expiresAt, t.refreshToken ? encrypt(t.refreshToken) : null,
     t.refreshExpiresAt ?? null, userId, platform]);
}

// ── OAuth state (anti-CSRF) ───────────────────────────────────────────────────

function hmac(s: string): string {
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET ?? '').update(s).digest('base64url');
}

/** Cookie value binding the OAuth round-trip to this browser, user and platform (10 minutes). */
export function makeStateCookie(userId: number, platform: ConnectablePlatform, lang: string) {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const exp = Date.now() + 10 * 60_000;
  const body = `${userId}.${platform}.${lang === 'en' ? 'en' : 'fr'}.${exp}.${nonce}`;
  return { nonce, cookie: `${body}.${hmac(body)}` };
}

export function readStateCookie(cookie: string | undefined, state: string | null, platform: ConnectablePlatform) {
  if (!cookie || !state) return null;
  const parts = cookie.split('.');
  if (parts.length !== 6) return null;
  const [uid, p, lang, exp, nonce, sig] = parts;
  const body = parts.slice(0, 5).join('.');
  const want = hmac(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (p !== platform || Number(exp) < Date.now()) return null;
  if (nonce.length !== state.length || !crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(state))) return null;
  return { userId: Number(uid), lang: lang as 'fr' | 'en' };
}
