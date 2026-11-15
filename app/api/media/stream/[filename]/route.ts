import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { currentUser, unauthorized, notFound } from '@/lib/session';
import { OUTPUT_DIR } from '@/lib/paths';
import { getProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// render_<id>.mp4, render_<id>_music.mp4, voice_<id>.mp3|wav, music_<id>.mp3, thumb_<id>.jpg
const FILE_RE = /^(render|voice|music|thumb)_([A-Za-z0-9-]{8,64}?)(_music)?\.(mp4|wav|mp3|jpg)$/;

const MIME: Record<string, string> = {
  mp4: 'video/mp4', wav: 'audio/wav', mp3: 'audio/mpeg', jpg: 'image/jpeg',
};

/** Streams a media file to the user who owns the project it belongs to (Range supported). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const m = FILE_RE.exec(filename);
  if (!m) return new NextResponse('Forbidden', { status: 403 });

  const user = await currentUser();
  if (!user) return unauthorized();
  if (!(await getProject(m[2], user.id))) return notFound();

  const filePath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filePath)) return notFound();

  const fileSize = fs.statSync(filePath).size;
  const contentType = MIME[m[4]] ?? 'application/octet-stream';
  const download = req.nextUrl.searchParams.get('download') === '1';
  const common = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
  };

  const range = req.headers.get('range');
  if (range) {
    const [startStr, endStr] = range.replace('bytes=', '').split('-');
    const start = Math.max(0, parseInt(startStr, 10) || 0);
    const end = Math.min(endStr ? parseInt(endStr, 10) : start + 1_000_000, fileSize - 1);
    if (start >= fileSize || end < start) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
    }
    const stream = fs.createReadStream(filePath, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: { ...common, 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Content-Length': String(end - start + 1) },
    });
  }

  const stream = fs.createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: { ...common, 'Content-Length': String(fileSize) },
  });
}
