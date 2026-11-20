import fs from 'fs';
import path from 'path';
import dns from 'dns/promises';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { OUTPUT_DIR, UPLOAD_DIR } from './paths';
import { createProject, updateProject, type ProjectMode } from './projects';
import { extractThumbnail } from './ffmpeg-studio';
import { qaImported } from './qa';

/**
 * Videos made outside Synthia (Claude Code + Remotion, Higgsfield, Kling, CapCut, a phone…) become normal
 * Synthia projects: they appear in the library and can be published or scheduled on every connected network.
 */

const run = promisify(execFile);
export const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;          // 1 GB

// ── SSRF-safe download ───────────────────────────────────────────────────────

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error('invalid_url'); }
  if (u.protocol !== 'https:') throw new Error('https_only');
  if (u.username || u.password) throw new Error('invalid_url');
  if (u.port && u.port !== '443') throw new Error('invalid_url');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(privateIp)) throw new Error('forbidden_host');
  return u;
}

/** Download a public https file (max 5 redirects, each hop re-checked) into `dest`. */
export async function safeDownload(url: string, dest: string, headers: Record<string, string> = {}, maxBytes = MAX_IMPORT_BYTES): Promise<void> {
  let current = url;
  let sendHeaders = headers;
  for (let hop = 0; hop < 6; hop++) {
    const u = await assertPublicUrl(current);
    const res = await axios.get(u.toString(), {
      responseType: 'stream', maxRedirects: 0, timeout: 60_000, headers: { 'User-Agent': 'SynthiaAI/1.0', ...sendHeaders },
      validateStatus: (s) => s < 400 || (s >= 300 && s < 400),
    });
    if (res.status >= 300 && res.status < 400) {
      res.data.destroy();
      const loc = res.headers.location;
      if (!loc) throw new Error('download_failed');
      const next = new URL(loc, u);
      if (next.host !== u.host) sendHeaders = {};          // never leak an API key to another host
      current = next.toString();
      continue;
    }
    const len = Number(res.headers['content-length'] ?? 0);
    if (len > maxBytes) { res.data.destroy(); throw new Error('too_large'); }
    await new Promise<void>((resolve, reject) => {
      let size = 0;
      const out = fs.createWriteStream(dest);
      res.data.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { res.data.destroy(); out.destroy(); reject(new Error('too_large')); }
      });
      res.data.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => resolve());
      res.data.pipe(out);
    }).catch((e) => { fs.rmSync(dest, { force: true }); throw e; });
    return;
  }
  throw new Error('too_many_redirects');
}

// ── Probe + register ─────────────────────────────────────────────────────────

export interface VideoInfo { duration: number; width: number; height: number; hasAudio: boolean; codec: string; container: string }

export async function probeVideo(file: string): Promise<VideoInfo> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { timeout: 60_000 });
  const j = JSON.parse(stdout);
  const v = (j.streams ?? []).find((s: { codec_type: string }) => s.codec_type === 'video');
  if (!v) throw new Error('not_a_video');
  return {
    duration: Number(j.format?.duration ?? v.duration ?? 0), width: Number(v.width), height: Number(v.height),
    hasAudio: (j.streams ?? []).some((s: { codec_type: string }) => s.codec_type === 'audio'),
    codec: String(v.codec_name ?? ''), container: String(j.format?.format_name ?? ''),
  };
}

/**
 * Turn a video file (already on disk, any common format) into a ready project owned by userId.
 * The source file is moved or transcoded to output/render_<id>.mp4 (H.264 + AAC, what every network accepts).
 */
export async function registerVideo(userId: number, src: string, meta: {
  title?: string | null; description?: string | null; hashtags?: string[]; mode?: ProjectMode; source?: string; projectId?: string;
}): Promise<string> {
  const info = await probeVideo(src);
  if (info.duration < 1 || info.duration > 4 * 3600) throw new Error('bad_duration');
  const id = meta.projectId ?? uuidv4();
  if (!meta.projectId) {
    await createProject({
      id, userId, mode: meta.mode ?? 'import', title: meta.title?.slice(0, 255) ?? null,
      script: meta.description?.slice(0, 20000) ?? null, hashtags: (meta.hashtags ?? []).slice(0, 30).map((h) => String(h).slice(0, 60)),
      resolution: `${info.width}x${info.height}`, duration: Math.round(info.duration), source: meta.source ?? null,
    });
  }
  await updateProject(id, { status: 'rendering', error: null });
  const out = path.join(OUTPUT_DIR, `render_${id}.mp4`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const playable = info.codec === 'h264' && /mp4|mov/.test(info.container);
  try {
    if (playable) {
      // remux only (fast): moov atom first so the video starts playing before it is fully downloaded
      await run('ffmpeg', ['-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', out], { timeout: 600_000 });
    } else {
      await run('ffmpeg', ['-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { timeout: 3_600_000 });
    }
  } finally {
    if (src.startsWith(UPLOAD_DIR + path.sep) || src.startsWith(OUTPUT_DIR + path.sep + 'incoming_')) fs.rmSync(src, { force: true });
  }
  const thumb = path.join(OUTPUT_DIR, `thumb_${id}.jpg`);
  try { await extractThumbnail(out, thumb, Math.min(1, info.duration / 2)); } catch { /* optional */ }
  await updateProject(id, {
    status: 'ready', outputFile: path.basename(out), thumbFile: fs.existsSync(thumb) ? path.basename(thumb) : null,
    fileSize: fs.statSync(out).size, duration: Math.round(info.duration), resolution: `${info.width}x${info.height}`, error: null,
  });
  // Made elsewhere: technical check + transcript of what is said; the creator approves before any publication.
  await qaImported(id, out).catch(() => updateProject(id, { qaStatus: 'manual', approvedAt: null }));
  return id;
}

/** Temporary file inside OUTPUT_DIR for a download in progress. */
export const incomingPath = () => { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); return path.join(OUTPUT_DIR, `incoming_${uuidv4()}`); };

/** Import from a public https URL in the background; returns the project id right away. */
export async function importFromUrl(userId: number, url: string, meta: Parameters<typeof registerVideo>[2]): Promise<string> {
  await assertPublicUrl(url);
  const id = uuidv4();
  await createProject({ id, userId, mode: meta.mode ?? 'import', title: meta.title?.slice(0, 255) ?? null,
    script: meta.description?.slice(0, 20000) ?? null, hashtags: (meta.hashtags ?? []).slice(0, 30), source: meta.source ?? 'url' });
  await updateProject(id, { status: 'rendering' });
  void (async () => {
    const tmp = incomingPath();
    try {
      await safeDownload(url, tmp);
      await registerVideo(userId, tmp, { ...meta, projectId: id });
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      await updateProject(id, { status: 'failed', error: `import: ${(e as Error).message}`.slice(0, 250) }).catch(() => {});
    }
  })();
  return id;
}
