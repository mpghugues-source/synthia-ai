import path from 'path';
import fs from 'fs';
import { publishAll, configuredPlatforms, type SocialPlatform } from './social-upload';
import { OUTPUT_DIR } from './paths';
import { updateProject, type Project } from './projects';

const ALL: SocialPlatform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'];

export function sanitizePlatforms(list: unknown): SocialPlatform[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((p): p is SocialPlatform => ALL.includes(p as SocialPlatform)))];
}

/** Publish a ready project to its platforms and record the per-platform results. */
export async function publishProject(project: Project, platforms: SocialPlatform[], description?: string) {
  if (project.status !== 'ready' || !project.outputFile) throw new Error('Video not ready');
  const videoPath = path.join(OUTPUT_DIR, path.basename(project.outputFile));
  if (!fs.existsSync(videoPath)) throw new Error('Video file missing');

  const configured = configuredPlatforms();
  const usable = platforms.filter((p) => configured[p]);
  const skipped = platforms.filter((p) => !configured[p])
    .map((p) => ({ platform: p, success: false, error: 'not_configured' }));

  await updateProject(project.id, { publishStatus: 'publishing' });
  const results = usable.length
    ? await publishAll({
        videoPath,
        title: project.title ?? 'Synthia AI',
        description: (description ?? project.script ?? '').slice(0, 4500),
        hashtags: project.hashtags,
        platforms: usable,
      })
    : [];
  const all = [...results, ...skipped];
  const ok = all.some((r) => r.success);
  await updateProject(project.id, { publishStatus: ok ? 'published' : 'failed', publishResults: all });
  return all;
}
