import path from 'path';
import fs from 'fs';
import { OUTPUT_DIR } from './paths';
import { updateProject, getBrandKit, type Project } from './projects';
import { getAccount } from './social/accounts';
import { youtubePublish, type YoutubePrivacy } from './social/youtube';
import { tiktokPublish, type TiktokOptions } from './social/tiktok';

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter';
const ALL: SocialPlatform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter'];
/** Platforms users can connect today (the others are announced as coming soon). */
export const LIVE_PLATFORMS: SocialPlatform[] = ['youtube', 'tiktok'];

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
  const [yt, tk] = await Promise.all([getAccount(userId, 'youtube').catch(() => null), getAccount(userId, 'tiktok').catch(() => null)]);
  return { youtube: Boolean(yt), tiktok: Boolean(tk), instagram: false, facebook: false, twitter: false };
}

/** Publish a ready project on the user's own connected accounts and record the results. */
export async function publishProject(project: Project, platforms: SocialPlatform[], options: PublishOptions = {}): Promise<PublishResult[]> {
  if (project.status !== 'ready' || !project.outputFile) throw new Error('Video not ready');
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
    } else {
      r = { success: false, error: 'coming_soon' };
    }
    results.push({ platform, ...r });
  }
  const ok = results.some((r) => r.success);
  await updateProject(project.id, { publishStatus: ok ? 'published' : 'failed', publishResults: results });
  return results;
}
