import crypto from 'crypto';
import { APP_URL } from './social/accounts';

/**
 * Short-lived public link to one rendered video. Instagram and Facebook fetch the file themselves from a
 * public URL (their APIs take `video_url` / `file_url`), so the link is signed, expires, and names one file.
 */

const sign = (s: string) =>
  crypto.createHmac('sha256', `media-link:${process.env.NEXTAUTH_SECRET ?? ''}`).update(s).digest('base64url').slice(0, 32);

export function publicVideoUrl(projectId: string, ttlSec = 3 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = `${projectId}.${exp}`;
  return `${APP_URL}/api/media/public/${projectId}/${exp}/${sign(body)}/video.mp4`;
}

export function checkPublicLink(projectId: string, exp: string, sig: string): boolean {
  if (!/^\d{10}$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = sign(`${projectId}.${exp}`);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
