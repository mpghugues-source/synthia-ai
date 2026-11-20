import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UPLOAD_DIR } from './paths';
import { createProject, updateProject } from './projects';
import { registerVideo } from './media-import';

const MAX = 100 * 1024 * 1024;     // Cloudflare refuses bigger request bodies

/** Real file signature: mp4/mov (ftyp) or webm/mkv (EBML). */
function isVideo(buf: Buffer): boolean {
  return buf.subarray(4, 8).toString('latin1') === 'ftyp' || buf.subarray(0, 4).toString('hex') === '1a45dfa3';
}

/** Save an uploaded video file and turn it into a project in the background. Returns the project id. */
export async function acceptUploadedVideo(userId: number, file: File, meta: { title?: string | null; description?: string | null; hashtags?: string[]; source?: string }): Promise<string> {
  if (file.size > MAX) throw new Error('too_large');
  const buf = Buffer.from(await file.arrayBuffer());
  if (!isVideo(buf)) throw new Error('not_a_video');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const tmp = path.join(UPLOAD_DIR, `import_${uuidv4()}`);
  fs.writeFileSync(tmp, buf);
  const id = uuidv4();
  await createProject({ id, userId, mode: 'import', title: meta.title?.slice(0, 255) || file.name.replace(/\.[^.]+$/, '').slice(0, 255),
    script: meta.description?.slice(0, 20000) ?? null, hashtags: meta.hashtags ?? [], source: meta.source ?? 'upload' });
  await updateProject(id, { status: 'rendering' });
  void registerVideo(userId, tmp, { projectId: id }).catch(async (e) => {
    fs.rmSync(tmp, { force: true });
    await updateProject(id, { status: 'failed', error: `import: ${(e as Error).message}`.slice(0, 250) }).catch(() => {});
  });
  return id;
}

export function formMeta(fd: FormData) {
  const str = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v : null; };
  const tags = str('hashtags');
  return {
    title: str('title'), description: str('description'), source: str('source')?.slice(0, 40) ?? undefined,
    hashtags: tags ? tags.split(/[,\s]+/).filter(Boolean).slice(0, 30) : [],
  };
}
