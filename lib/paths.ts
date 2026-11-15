import path from 'path';
import fs from 'fs';

export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output'));
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads'));

/**
 * Accept a media path sent back by the browser only if it is an existing file inside the
 * output or upload directory. Returns the resolved path, or null.
 */
export function safeMediaPath(p: unknown): string | null {
  if (typeof p !== 'string' || !p) return null;
  const resolved = path.resolve(p);
  const inside = [OUTPUT_DIR, UPLOAD_DIR].some((d) => resolved.startsWith(d + path.sep));
  if (!inside) return null;
  try {
    const real = fs.realpathSync(resolved);
    if (![OUTPUT_DIR, UPLOAD_DIR].some((d) => real.startsWith(d + path.sep))) return null;
    return fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

/** Same as safeMediaPath for a list; silently drops invalid entries. */
export function safeMediaPaths(list: unknown, max = 40): string[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map(safeMediaPath).filter((p): p is string => Boolean(p));
}

/** Job ids are generated server-side (uuid or 12 hex chars). */
export function isValidJobId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
}
