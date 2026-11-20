import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from './db';

/** Autosaved Studio work ("projects that stay"), one row per project the user started. */

export interface DraftSummary { id: string; title: string | null; mode: string; projectId: string | null; updatedAt: string }
interface Row extends RowDataPacket { id: string; title: string | null; mode: string; state_json: string; project_id: string | null; updated_at: Date }

const MAX_STATE = 200_000;            // characters of JSON
const MAX_DRAFTS = 300;

export const isDraftId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/.test(s);
const clean = (t: unknown) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 255) || null : null);
const modeOf = (m: unknown) => (['ai', 'manual', 'narration'].includes(m as string) ? (m as string) : 'ai');

export async function listDrafts(userId: number, limit = 30): Promise<DraftSummary[]> {
  const [rows] = await pool.query<Row[]>(
    'SELECT id, title, mode, project_id, updated_at FROM studio_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
    [userId, Math.min(Math.max(limit, 1), 100)]);
  return rows.map((r) => ({ id: r.id, title: r.title, mode: r.mode, projectId: r.project_id, updatedAt: new Date(r.updated_at).toISOString() }));
}

export async function getDraft(userId: number, id: string) {
  const [rows] = await pool.query<Row[]>('SELECT * FROM studio_drafts WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  const r = rows[0];
  if (!r) return null;
  let state: unknown = {};
  try { state = JSON.parse(r.state_json); } catch { /* empty */ }
  return { id: r.id, title: r.title, mode: r.mode, projectId: r.project_id, updatedAt: new Date(r.updated_at).toISOString(), state };
}

/** Create (id omitted) or update a draft. Returns its id. */
export async function saveDraft(userId: number, d: { id?: unknown; title?: unknown; mode?: unknown; state?: unknown; projectId?: unknown }): Promise<string> {
  const json = JSON.stringify(d.state ?? {});
  if (json.length > MAX_STATE) throw new Error('too_large');
  const projectId = typeof d.projectId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(d.projectId) ? d.projectId : null;
  if (isDraftId(d.id)) {
    const [res] = await pool.query<ResultSetHeader>(
      'UPDATE studio_drafts SET title = ?, mode = ?, state_json = ?, project_id = COALESCE(?, project_id) WHERE id = ? AND user_id = ?',
      [clean(d.title), modeOf(d.mode), json, projectId, d.id, userId]);
    if (res.affectedRows > 0) return d.id;
    const [own] = await pool.query<Row[]>('SELECT id FROM studio_drafts WHERE id = ? AND user_id = ?', [d.id, userId]);
    if (own[0]) return d.id;
  }
  const id = uuidv4();
  await pool.query('INSERT INTO studio_drafts (id, user_id, title, mode, state_json, project_id) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, clean(d.title), modeOf(d.mode), json, projectId]);
  // keep the list bounded: drop the oldest beyond MAX_DRAFTS
  await pool.query(
    `DELETE FROM studio_drafts WHERE user_id = ? AND id NOT IN (
       SELECT id FROM (SELECT id FROM studio_drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?) keep)`,
    [userId, userId, MAX_DRAFTS]).catch(() => {});
  return id;
}

export async function deleteDraft(userId: number, id: string): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>('DELETE FROM studio_drafts WHERE id = ? AND user_id = ?', [id, userId]);
  return res.affectedRows > 0;
}
