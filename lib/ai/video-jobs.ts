import fs from 'fs';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db';
import { createProject, updateProject } from '../projects';
import { safeDownload, registerVideo, incomingPath } from '../media-import';
import { getConnection, startVideo, pollVideo, markUsed, VIDEO_PROVIDERS, type Provider, type VideoRequest } from './providers';

/**
 * AI video generation with the user's own key (Kling, Veo, Replicate…). The generation becomes a project:
 * status "rendering" while the provider works, "ready" once the video is downloaded into Synthia.
 * Polling runs in the app process; `resumeGenerations()` (called every minute by the scheduler) picks up
 * generations interrupted by a restart.
 */

const POLL_MS = 15_000;
const MAX_AGE_MS = 60 * 60_000;                  // give up after 1 hour
const active = new Set<number>();

interface GenRow extends RowDataPacket {
  id: number; user_id: number; project_id: string; provider: Provider; external_id: string | null; created_at: Date;
}

export async function startGeneration(userId: number, provider: Provider, req: VideoRequest & { title?: string }): Promise<string> {
  if (!VIDEO_PROVIDERS.includes(provider)) throw new Error('not_a_video_provider');
  const c = await getConnection(userId, provider);
  if (!c) throw new Error('not_connected');
  const { externalId, model } = await startVideo(c, req);
  markUsed(userId, provider);
  const projectId = uuidv4();
  await createProject({ id: projectId, userId, mode: 'generated', title: (req.title || req.prompt).slice(0, 120),
    script: req.prompt, resolution: req.aspect === '16:9' ? '1920x1080' : req.aspect === '1:1' ? '1080x1080' : '1080x1920',
    duration: req.duration, source: `${provider}:${model}`.slice(0, 40) });
  await updateProject(projectId, { status: 'rendering' });
  const [res] = await pool.query<ResultSetHeader>(
    'INSERT INTO ai_generations (user_id, project_id, provider, model, external_id, prompt, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, projectId, provider, model, externalId, req.prompt.slice(0, 10000), 'running']);
  follow(res.insertId);
  return projectId;
}

async function finish(id: number, projectId: string, status: 'succeeded' | 'failed', error?: string) {
  await pool.query('UPDATE ai_generations SET status = ?, error = ? WHERE id = ?', [status, error?.slice(0, 500) ?? null, id]);
  if (status === 'failed') await updateProject(projectId, { status: 'failed', error: (error ?? 'generation failed').slice(0, 250) });
}

function follow(id: number): void {
  if (active.has(id)) return;
  active.add(id);
  void (async () => {
    try {
      for (;;) {
        const [rows] = await pool.query<GenRow[]>('SELECT * FROM ai_generations WHERE id = ? AND status = ?', [id, 'running']);
        const g = rows[0];
        if (!g) return;
        if (Date.now() - new Date(g.created_at).getTime() > MAX_AGE_MS) return finish(id, g.project_id, 'failed', 'timeout (1 h)');
        const c = await getConnection(g.user_id, g.provider);
        if (!c || !g.external_id) return finish(id, g.project_id, 'failed', 'AI connection removed');
        const r = await pollVideo(c, g.external_id).catch(() => ({ state: 'running' as const }));
        if (r.state === 'failed') return finish(id, g.project_id, 'failed', r.error);
        if (r.state === 'done') {
          const tmp = incomingPath();
          try {
            await safeDownload(r.url, tmp, r.headers ?? {});
            await registerVideo(g.user_id, tmp, { projectId: g.project_id });
            await finish(id, g.project_id, 'succeeded');
          } catch (e) {
            fs.rmSync(tmp, { force: true });
            await finish(id, g.project_id, 'failed', `download: ${(e as Error).message}`);
          }
          return;
        }
        await new Promise((res) => setTimeout(res, POLL_MS));
      }
    } finally {
      active.delete(id);
    }
  })();
}

/** Resume generations still running (after a restart). Safe to call often. */
export async function resumeGenerations(): Promise<void> {
  const [rows] = await pool.query<GenRow[]>("SELECT id FROM ai_generations WHERE status = 'running' LIMIT 50").catch(() => [[] as GenRow[]]);
  for (const r of rows) follow(r.id);
}
