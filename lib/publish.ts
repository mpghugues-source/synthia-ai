import path from 'path';
import fs from 'fs';
import { OUTPUT_DIR } from './paths';
import { updateProject, getBrandKit, type Project } from './projects';
import { getAccount } from './social/accounts';
import { youtubePublish, type YoutubePrivacy } from './social/youtube';
import { tiktokPublish, type TiktokOptions } from './social/tiktok';
import { instagramPublish } from './social/instagram';
import { facebookPublish } from './social/facebook';
import { xPublish } from './social/x';
import { CONNECTABLE } from './social/accounts';

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter';
const ALL: SocialPlatform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'];
/** Platforms users can connect. */
export const LIVE_PLATFORMS: SocialPlatform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'];

export interface PublishOptions {
  caption?: string;                       // overrides title/description text
  youtube?: { privacy: YoutubePrivacy };
  tiktok?: TiktokOptions;
}

export interface PublishResult { platform: SocialPlatform; success: boolean; postId?: string; url?: string; error?: string }

export function sanitizePlatforms(list: unknown): SocialPlatform[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((p): p is SocialPlatform => ALL.includes(p as SocialPlatform)))];
}

/** Keep only well-formed option values coming from the browser. */
export function sanitizeOptions(raw: unknown): PublishOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | string | undefined>;
  const out: PublishOptions = {};
  if (typeof o.caption === 'string' && o.caption.trim()) out.caption = o.caption.slice(0, 2200);
  const yt = o.youtube as Record<string, unknown> | undefined;
  const privacy = yt?.privacy;
  out.youtube = { privacy: privacy === 'unlisted' || privacy === 'private' ? privacy : 'public' };
  const tk = o.tiktok as Record<string, unknown> | undefined;
  if (tk) {
    out.tiktok = {
      mode: tk.mode === 'direct' ? 'direct' : 'draft',
      privacy: typeof tk.privacy === 'string' ? tk.privacy.slice(0, 40) : undefined,
      disableComment: Boolean(tk.disableComment), disableDuet: Boolean(tk.disableDuet), disableStitch: Boolean(tk.disableStitch),
      brandOrganic: Boolean(tk.brandOrganic), brandedContent: Boolean(tk.brandedContent),
    };
  }
  return out;
}

/** Which platforms the user has connected (used by the Studio and the calendar). */
export async function connectedPlatforms(userId: number): Promise<Record<SocialPlatform, boolean>> {
  const found = await Promise.all(CONNECTABLE.map((p) => getAccount(userId, p).catch(() => null)));
  return Object.fromEntries(CONNECTABLE.map((p, i) => [p, Boolean(found[i])])) as Record<SocialPlatform, boolean>;
}

/** Publish a ready project on the user's own connected accounts and record the results. */
export async function publishProject(project: Project, platforms: SocialPlatform[], options: PublishOptions = {}): Promise<PublishResult[]> {
  if (project.status !== 'ready' || !project.outputFile) throw new Error('Video not ready');
  // The creator's rule: nothing is published before they approved this exact render (approval is reset by any re-render).
  if (!project.approvedAt || !['passed', 'manual'].includes(project.qaStatus ?? '')) {
    const results: PublishResult[] = platforms.map((platform) => ({ platform, success: false, error: project.approvedAt ? 'qa_failed' : 'approval_required' }));
    await updateProject(project.id, { publishStatus: 'failed', publishResults: results });
    return results;
  }
  const videoPath = path.join(OUTPUT_DIR, path.basename(project.outputFile));
  if (!fs.existsSync(videoPath)) throw new Error('Video file missing');

  await updateProject(project.id, { publishStatus: 'publishing' });
  const tags = project.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`));
  const description = options.caption ?? project.script ?? '';
  const lang = (await getBrandKit(project.userId).catch(() => null))?.defaultLang ?? 'fr';
  const results: PublishResult[] = [];
  for (const platform of platforms) {
    let r: Omit<PublishResult, 'platform'>;
    if (platform === 'youtube') {
      r = await youtubePublish(project.userId, {
        videoPath, title: project.title ?? 'Synthia', description, hashtags: tags,
        privacy: options.youtube?.privacy ?? 'public', vertical: project.resolution === '1080x1920',
        durationSec: project.duration, lang,
      });
    } else if (platform === 'tiktok') {
      const caption = (options.caption ?? `${project.title ?? ''} ${tags.slice(0, 6).join(' ')}`).trim();
      r = await tiktokPublish(project.userId, { videoPath, caption, options: options.tiktok ?? { mode: 'draft' } });
    } else if (platform === 'instagram') {
      const caption = (options.caption ?? `${project.title ?? ''}\n\n${description}`).trim();
      r = await instagramPublish(project.userId, { projectId: project.id, caption: `${caption}\n\n${tags.slice(0, 20).join(' ')}`.trim() });
    } else if (platform === 'facebook') {
      r = await facebookPublish(project.userId, { projectId: project.id, title: project.title ?? 'Synthia',
        description: `${description}\n\n${tags.join(' ')}`.trim() });
    } else {
      const base = (options.caption ?? project.title ?? '').trim();
      const tagStr = tags.slice(0, 3).join(' ');
      const text = base.length + tagStr.length + 1 <= 280 ? `${base} ${tagStr}`.trim() : base.slice(0, 279);
      r = await xPublish(project.userId, { videoPath, text });
    }
    results.push({ platform, ...r });
  }
  const ok = results.some((r) => r.success);
  await updateProject(project.id, { publishStatus: ok ? 'published' : 'failed', publishResults: results });
  return results;
}
