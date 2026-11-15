import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function buildId(): string {
  try { return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf-8').trim(); } catch { return 'dev'; }
}

/** The service worker, stamped with the current build id so each deployment is a new version. */
export function GET() {
  const content = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8')
    .replaceAll('__SW_VERSION__', buildId().replace(/[^\w-]/g, ''));
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
