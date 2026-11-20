import type { RowDataPacket } from 'mysql2';
import pool from '../db';

/** Per-user phonetic lexicon (ESENGO rule: the lexicon changes the VOICE only; screen and subtitles keep the spelling). */

export interface LexEntry { id: number; lang: string; word: string; spoken: string }
interface Row extends RowDataPacket { id: number; lang: string; word: string; spoken: string }

export async function listLexicon(userId: number): Promise<LexEntry[]> {
  const [rows] = await pool.query<Row[]>('SELECT id, lang, word, spoken FROM voice_lexicon WHERE user_id = ? ORDER BY lang, word', [userId]);
  return rows.map((r) => ({ id: r.id, lang: r.lang, word: r.word, spoken: r.spoken }));
}

export async function saveLexicon(userId: number, lang: string, word: string, spoken: string): Promise<void> {
  const w = word.trim().slice(0, 80), s = spoken.trim().slice(0, 160);
  if (!w || !s || !/^[a-z]{2}$/.test(lang)) throw new Error('bad_request');
  await pool.query('INSERT INTO voice_lexicon (user_id, lang, word, spoken) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE spoken = VALUES(spoken)',
    [userId, lang, w, s]);
}

export async function deleteLexicon(userId: number, id: number): Promise<void> {
  await pool.query('DELETE FROM voice_lexicon WHERE id = ? AND user_id = ?', [id, userId]);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text the voice will read: lexicon words replaced (whole words, case-insensitive). */
export async function applyLexicon(userId: number, lang: string, text: string): Promise<string> {
  const [rows] = await pool.query<Row[]>('SELECT word, spoken FROM voice_lexicon WHERE user_id = ? AND lang = ?', [userId, lang.slice(0, 2)])
    .catch(() => [[] as Row[]]);
  let out = text;
  for (const r of rows.sort((a, b) => b.word.length - a.word.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(r.word)}(?![\\p{L}\\p{N}])`, 'giu'), r.spoken);
  }
  return out;
}
