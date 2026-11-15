import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from './db';

export type ProjectMode = 'ai' | 'manual' | 'narration';
export type ProjectStatus = 'draft' | 'rendering' | 'ready' | 'failed';
export type PublishStatus = 'none' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface Project {
  id: string;
  userId: number;
  mode: ProjectMode;
  title: string | null;
  script: string | null;
  hashtags: string[];
  status: ProjectStatus;
  outputFile: string | null;
  thumbFile: string | null;
  duration: number | null;
  resolution: string | null;
  fileSize: number | null;
  error: string | null;
  platforms: string[];
  scheduledAt: string | null;
  publishStatus: PublishStatus;
  publishResults: unknown;
  publishOptions: unknown;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow extends RowDataPacket {
  id: string; user_id: number; mode: ProjectMode; title: string | null; script: string | null;
  hashtags: string | null; status: ProjectStatus; output_file: string | null; thumb_file: string | null;
  duration: number | null; resolution: string | null; file_size: number | null; error: string | null;
  platforms: string | null; scheduled_at: Date | null; publish_status: PublishStatus;
  publish_results: string | null; publish_options: string | null; created_at: Date; updated_at: Date;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function toProject(r: ProjectRow): Project {
  return {
    id: r.id, userId: r.user_id, mode: r.mode, title: r.title, script: r.script,
    hashtags: parseJson<string[]>(r.hashtags, []), status: r.status,
    outputFile: r.output_file, thumbFile: r.thumb_file, duration: r.duration,
    resolution: r.resolution, fileSize: r.file_size === null ? null : Number(r.file_size),
    error: r.error, platforms: parseJson<string[]>(r.platforms, []),
    scheduledAt: r.scheduled_at ? new Date(r.scheduled_at).toISOString() : null,
    publishStatus: r.publish_status, publishResults: parseJson<unknown>(r.publish_results, null),
    publishOptions: parseJson<unknown>(r.publish_options, null),
    createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function createProject(p: {
  id: string; userId: number; mode: ProjectMode; title?: string | null; script?: string | null;
  hashtags?: string[]; resolution?: string; duration?: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO projects (id, user_id, mode, title, script, hashtags, resolution, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [p.id, p.userId, p.mode, p.title ?? null, p.script ?? null, JSON.stringify(p.hashtags ?? []),
     p.resolution ?? null, p.duration ?? null],
  );
}

/** The project if it exists AND belongs to userId. */
export async function getProject(id: string, userId: number): Promise<Project | null> {
  const [rows] = await pool.query<ProjectRow[]>(
    'SELECT * FROM projects WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function getProjectAnyUser(id: string): Promise<Project | null> {
  const [rows] = await pool.query<ProjectRow[]>('SELECT * FROM projects WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? toProject(rows[0]) : null;
}

const COLUMN: Record<string, string> = {
  mode: 'mode', title: 'title', script: 'script', hashtags: 'hashtags', status: 'status',
  outputFile: 'output_file', thumbFile: 'thumb_file', duration: 'duration', resolution: 'resolution',
  fileSize: 'file_size', error: 'error', platforms: 'platforms', scheduledAt: 'scheduled_at',
  publishStatus: 'publish_status', publishResults: 'publish_results', publishOptions: 'publish_options',
};
const JSON_FIELDS = new Set(['hashtags', 'platforms', 'publishResults', 'publishOptions']);

export async function updateProject(id: string, fields: Partial<Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    const col = COLUMN[k];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    if (JSON_FIELDS.has(k)) values.push(v === null ? null : JSON.stringify(v));
    else if (k === 'scheduledAt') values.push(v ? new Date(v as string) : null);
    else values.push(v);
  }
  if (!sets.length) return;
  values.push(id);
  await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, values);
}

export async function listProjects(userId: number, opts: { limit?: number } = {}): Promise<Project[]> {
  const [rows] = await pool.query<ProjectRow[]>(
    'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, Math.min(opts.limit ?? 200, 500)]);
  return rows.map(toProject);
}

export async function deleteProject(id: string, userId: number): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, userId]);
  return res.affectedRows > 0;
}

export async function dueScheduledProjects(): Promise<Project[]> {
  const [rows] = await pool.query<ProjectRow[]>(
    `SELECT * FROM projects WHERE publish_status = 'scheduled' AND status = 'ready'
       AND scheduled_at IS NOT NULL AND scheduled_at <= NOW() ORDER BY scheduled_at LIMIT 10`);
  return rows.map(toProject);
}

// ── Plans & quota ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<string, number> = { free: 3, starter: 10, creator: 50, studio: -1 };

export interface Usage { plan: string; used: number; limit: number; unlimited: boolean; periodStart: string }

interface UsageRow extends RowDataPacket { plan: string; videos_used: number; videos_limit: number; period_start: Date | null }

function monthStart(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Current usage; resets the counter when a new calendar month has started. */
export async function getUsage(userId: number): Promise<Usage> {
  const start = monthStart();
  await pool.query(
    `UPDATE users SET videos_used = 0, period_start = ?
      WHERE id = ? AND (period_start IS NULL OR period_start < ?)`, [start, userId, start]);
  const [rows] = await pool.query<UsageRow[]>(
    'SELECT plan, videos_used, videos_limit, period_start FROM users WHERE id = ?', [userId]);
  const r = rows[0];
  const plan = r?.plan ?? 'free';
  const limit = PLAN_LIMITS[plan] ?? r?.videos_limit ?? 3;
  return { plan, used: r?.videos_used ?? 0, limit, unlimited: limit < 0, periodStart: start };
}

export async function hasQuota(userId: number): Promise<boolean> {
  const u = await getUsage(userId);
  return u.unlimited || u.used < u.limit;
}

/** Count a finished render against the quota, once per project. */
export async function countRender(projectId: string, userId: number): Promise<void> {
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE projects SET counted = 1 WHERE id = ? AND counted = 0', [projectId]);
  if (res.affectedRows > 0) {
    await pool.query('UPDATE users SET videos_used = videos_used + 1 WHERE id = ?', [userId]);
  }
}

export const quotaExceeded = (lang: string | null = 'fr') => ({
  error: lang === 'en'
    ? 'Monthly video quota reached. Upgrade your plan to keep creating.'
    : 'Quota mensuel de vidéos atteint. Passez à un plan supérieur pour continuer.',
  code: 'quota_exceeded',
});

// ── Brand kit ─────────────────────────────────────────────────────────────────

export type CaptionStyle = 'box' | 'bold' | 'minimal' | 'neon' | 'none';
export const CAPTION_STYLES: CaptionStyle[] = ['box', 'bold', 'minimal', 'neon', 'none'];

export interface BrandKit {
  watermark: string | null;
  captionStyle: CaptionStyle;
  defaultLang: string;
  defaultFormat: string;
  defaultVoice: string | null;
  tone: string | null;
}

interface BrandRow extends RowDataPacket {
  watermark: string | null; caption_style: string; default_lang: string; default_format: string;
  default_voice: string | null; tone: string | null;
}

export async function getBrandKit(userId: number): Promise<BrandKit> {
  const [rows] = await pool.query<BrandRow[]>('SELECT * FROM brand_kits WHERE user_id = ?', [userId]);
  const r = rows[0];
  return {
    watermark: r?.watermark ?? null,
    captionStyle: (CAPTION_STYLES as string[]).includes(r?.caption_style ?? '') ? r!.caption_style as CaptionStyle : 'box',
    defaultLang: r?.default_lang ?? 'fr',
    defaultFormat: r?.default_format ?? '1080x1920',
    defaultVoice: r?.default_voice ?? null,
    tone: r?.tone ?? null,
  };
}

export async function saveBrandKit(userId: number, k: BrandKit): Promise<void> {
  await pool.query(
    `INSERT INTO brand_kits (user_id, watermark, caption_style, default_lang, default_format, default_voice, tone)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE watermark = VALUES(watermark), caption_style = VALUES(caption_style),
       default_lang = VALUES(default_lang), default_format = VALUES(default_format),
       default_voice = VALUES(default_voice), tone = VALUES(tone)`,
    [userId, k.watermark, k.captionStyle, k.defaultLang, k.defaultFormat, k.defaultVoice, k.tone]);
}
