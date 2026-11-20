import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { OUTPUT_DIR, isValidJobId } from '@/lib/paths';
import { getProjectAnyUser } from '@/lib/projects';
import { checkPublicLink } from '@/lib/media-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed, expiring public link to a rendered video (fetched by Instagram / Facebook when publishing). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; exp: string; sig: string; file: string }> }) {
  const { id, exp, sig, file } = await params;
  if (file !== 'video.mp4' || !isValidJobId(id) || !checkPublicLink(id, exp, sig)) return new NextResponse('Not found', { status: 404 });
  const p = await getProjectAnyUser(id);
  if (!p?.outputFile || p.status !== 'ready') return new NextResponse('Not found', { status: 404 });
  const filePath = path.join(OUTPUT_DIR, path.basename(p.outputFile));
  if (!fs.existsSync(filePath)) return new NextResponse('Not found', { status: 404 });
  const size = fs.statSync(filePath).size;
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex', 'Content-Disposition': 'inline; filename="video.mp4"' };
  const range = req.headers.get('range');
  if (range) {
    const [a, b] = range.replace('bytes=', '').split('-');
    const start = Math.max(0, parseInt(a, 10) || 0);
    const end = Math.min(b ? parseInt(b, 10) : size - 1, size - 1);
    if (start >= size || end < start) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new NextResponse(fs.createReadStream(filePath, { start, end }) as unknown as ReadableStream, {
      status: 206, headers: { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new NextResponse(fs.createReadStream(filePath) as unknown as ReadableStream, { headers: { ...head, 'Content-Length': String(size) } });
}
