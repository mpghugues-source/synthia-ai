import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { rateLimit } from '@/lib/rate-limit';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { UPLOAD_DIR, isValidJobId } from '@/lib/paths';
import { createProject, getProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  'audio/wav': 'wav', 'audio/wave': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
const MAX_FILE = 100 * 1024 * 1024;   // Cloudflare refuses bigger request bodies anyway
const MAX_FILES = 30;

/** Check the file's real signature: the MIME type sent by the browser can be anything. */
function sniff(buf: Buffer): string | null {
  const hex = buf.subarray(0, 16).toString('hex');
  const ascii = buf.subarray(0, 16).toString('latin1');
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return 'wav';
  if (ascii.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ascii.slice(4, 8) === 'ftyp') return ascii.slice(8, 10) === 'qt' ? 'mov' : 'mp4';
  if (hex.startsWith('1a45dfa3')) return 'webm';
  return null;
}
const COMPATIBLE: Record<string, string[]> = { mp4: ['mp4', 'mov'], mov: ['mov', 'mp4'] };

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (!rateLimit(`upload:${user.id}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true });

    const formData = await req.formData();
    const askedJob = formData.get('jobId');
    let jobId: string;
    if (typeof askedJob === 'string' && askedJob) {
      if (!isValidJobId(askedJob) || !(await getProject(askedJob, user.id))) return notFound();
      jobId = askedJob;
    } else {
      jobId = uuidv4();
      const mode = formData.get('mode') === 'narration' ? 'narration' : 'manual';
      const title = formData.get('title');
      await createProject({ id: jobId, userId: user.id, mode, title: typeof title === 'string' ? title.slice(0, 255) : null });
    }

    const saved: { field: string; path: string }[] = [];
    let count = 0;
    for (const [field, value] of formData.entries()) {
      if (!(value instanceof File)) continue;
      if (!['voiceover', 'music', 'images', 'clips'].includes(field) || ++count > MAX_FILES) continue;
      // The extension comes from the validated MIME type, never from the client's file name.
      const ext = TYPES[value.type];
      if (!ext || value.size > MAX_FILE) continue;
      const head = Buffer.from(await value.slice(0, 16).arrayBuffer());
      const real = sniff(head);
      if (!real || !(real === ext || COMPATIBLE[ext]?.includes(real))) continue;
      const slug = field === 'voiceover' ? `voice_manual_${jobId}` : `asset_${jobId}_${uuidv4().slice(0, 8)}`;
      const filePath = path.join(UPLOAD_DIR, `${slug}.${ext}`);
      writeFileSync(filePath, Buffer.from(await value.arrayBuffer()));
      saved.push({ field, path: filePath });
    }

    if (count > 0 && saved.length === 0) {
      return NextResponse.json({ error: 'Fichier non pris en charge ou corrompu. / Unsupported or corrupted file.' }, { status: 415 });
    }

    const voicePath  = saved.find((f) => f.field === 'voiceover')?.path ?? null;
    const musicPath  = saved.find((f) => f.field === 'music')?.path ?? null;
    const imagePaths = saved.filter((f) => f.field === 'images').map((f) => f.path);
    const clipPaths  = saved.filter((f) => f.field === 'clips').map((f) => f.path);

    return NextResponse.json({ success: true, jobId, voicePath, musicPath, imagePaths, clipPaths });
  } catch (err) {
    console.error('[upload]', err);
    return NextResponse.json({ error: 'Upload error' }, { status: 500 });
  }
}
