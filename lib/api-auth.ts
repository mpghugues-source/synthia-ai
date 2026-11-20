import crypto from 'crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from './db';
import { currentUser, type SessionUser } from './session';

/**
 * Personal access tokens: let Claude Code, MCP clients (Claude Desktop, Cursor, ChatGPT connectors…)
 * and scripts act for a user. Format `syn_<40 random chars>`; only its SHA-256 is stored.
 */

const PREFIX = 'syn_';
const MAX_TOKENS = 10;

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export interface ApiToken { id: number; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }

interface TokenRow extends RowDataPacket {
  id: number; user_id: number; name: string; prefix: string; created_at: Date; last_used_at: Date | null;
  email: string; uname: string | null;
}

export async function createToken(userId: number, name: string): Promise<{ token: string; info: ApiToken }> {
  const [[{ n }]] = await pool.query<(RowDataPacket & { n: number })[]>(
    'SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  if (n >= MAX_TOKENS) throw new Error('too_many_tokens');
  const token = PREFIX + crypto.randomBytes(30).toString('base64url');
  const prefix = token.slice(0, 10);
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80) || 'Claude Code';
  const [res] = await pool.query<ResultSetHeader>(
    'INSERT INTO api_tokens (user_id, name, token_hash, prefix) VALUES (?, ?, ?, ?)', [userId, clean, sha(token), prefix]);
  return { token, info: { id: res.insertId, name: clean, prefix, createdAt: new Date().toISOString(), lastUsedAt: null } };
}

export async function listTokens(userId: number): Promise<ApiToken[]> {
  const [rows] = await pool.query<TokenRow[]>(
    'SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC',
    [userId]);
  return rows.map((r) => ({
    id: r.id, name: r.name, prefix: r.prefix, createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  }));
}

export async function revokeToken(userId: number, id: number): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE api_tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [id, userId]);
  return res.affectedRows > 0;
}

/** User owning a valid bearer token, or null. */
export async function userFromToken(token: string): Promise<SessionUser | null> {
  if (!token.startsWith(PREFIX) || token.length < 40 || token.length > 80) return null;
  const [rows] = await pool.query<TokenRow[]>(
    `SELECT t.id, t.user_id, u.email, u.name AS uname FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL LIMIT 1`, [sha(token)]);
  const r = rows[0];
  if (!r) return null;
  void pool.query('UPDATE api_tokens SET last_used_at = NOW() WHERE id = ?', [r.id]).catch(() => {});
  return { id: r.user_id, email: r.email, name: r.uname };
}

/** Bearer token if present, otherwise the browser session. */
export async function apiUser(req: Request): Promise<SessionUser | null> {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) return userFromToken(m[1]);
  return currentUser();
}
