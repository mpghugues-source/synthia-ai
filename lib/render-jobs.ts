import path from 'path';
import fs from 'fs';
import { renderVideo, extractThumbnail, type RenderOptions } from './ffmpeg-studio';
import { OUTPUT_DIR } from './paths';
import { updateProject, countRender, getBrandKit, getProjectAnyUser } from './projects';
import { qaVoice, qaFinal, QaError, type QaReport } from './qa';

/**
 * Renders run in the background of the app process: an HTTP request through Cloudflare is cut
 * after 100 s, and a CPU render takes longer. The browser polls GET /api/projects/:id instead.
 * At most MAX_PARALLEL renders run at once (ffmpeg is CPU-bound); the others wait their turn.
 */
const MAX_PARALLEL = Number(process.env.SYNTHIA_MAX_RENDERS ?? 2);
let running = 0;
const waiting: (() => void)[] = [];

async function slot(): Promise<() => void> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  return () => { running--; waiting.shift()?.(); };
}

export interface RenderJob {
  projectId: string;
  userId: number;
  options: Omit<RenderOptions, 'outputPath' | 'captionStyle' | 'watermark'> & {
    captionStyle?: RenderOptions['captionStyle'];
  };
  meta?: Record<string, unknown>;
}

/** Finalise a rendered file: thumbnail, size, status, quota, legacy metadata. */
export async function finalizeRender(projectId: string, userId: number, finalPath: string, extra: Record<string, unknown> = {}) {
  const thumbPath = path.join(OUTPUT_DIR, `thumb_${projectId}.jpg`);
  try { await extractThumbnail(finalPath, thumbPath, 1); } catch { /* poster is optional */ }
  await updateProject(projectId, {
    status: 'ready',
    outputFile: path.basename(finalPath),
    thumbFile: fs.existsSync(thumbPath) ? path.basename(thumbPath) : null,
    fileSize: fs.statSync(finalPath).size,
    error: null,
    ...(typeof extra.duration === 'number' ? { duration: Math.round(extra.duration) } : {}),
  });
  await countRender(projectId, userId);
  // Step 4 of the quality control; the video then waits for the creator's approval before any publication.
  const p = await getProjectAnyUser(projectId);
  await qaFinal(projectId, finalPath, (p?.qaReport as QaReport | null) ?? null).catch(async (e) => {
    console.error(`[qa final ${projectId}]`, e);
    await updateProject(projectId, { qaStatus: 'failed', approvedAt: null }).catch(() => {});
  });
}

export function startRender(job: RenderJob): void {
  const outputPath = path.join(OUTPUT_DIR, `render_${job.projectId}.mp4`);
  void (async () => {
    await updateProject(job.projectId, { status: 'rendering', error: null, approvedAt: null, qaStatus: 'running' });
    const release = await slot();
    try {
      const brand = await getBrandKit(job.userId);
      // Steps 2-3 of the quality control: pronunciation (whisper, 100 %) and clear voice, BEFORE the render.
      const script = job.options.subtitleText;
      if (job.options.voiceoverPath && script && script.trim()) {
        const lang = typeof job.meta?.lang === 'string' ? job.meta.lang : brand.defaultLang;
        const prev = (await getProjectAnyUser(job.projectId))?.qaReport as QaReport | null;
        try {
          await qaVoice(job.projectId, job.options.voiceoverPath, script, lang, prev);
        } catch (e) {
          if (e instanceof QaError) return;                 // video held, report saved
          throw e;
        }
      }
      const finalPath = await renderVideo({
        ...job.options,
        outputPath,
        captionStyle: job.options.captionStyle ?? brand.captionStyle,
        watermark: brand.watermark,
      });
      fs.writeFileSync(path.join(OUTPUT_DIR, `render_${job.projectId}.json`), JSON.stringify({
        jobId: job.projectId, userId: job.userId, outputPath: finalPath,
        renderedAt: new Date().toISOString(), ...job.meta,
      }, null, 2));
      await finalizeRender(job.projectId, job.userId, finalPath);
    } catch (e) {
      console.error(`[render ${job.projectId}]`, e);
      await updateProject(job.projectId, {
        status: 'failed', error: 'Le montage a échoué. Réessayez ou changez de médias. / Rendering failed, please retry.',
      }).catch(() => {});
    } finally {
      release();
    }
  })();
}
