import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { authOptions } from './auth';

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
}

/** Authenticated user of the current request, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; email?: string; name?: string } | undefined;
  const id = Number(u?.id);
  if (!u || !Number.isInteger(id) || id <= 0) return null;
  return { id, email: u.email ?? '', name: u.name ?? null };
}

export const unauthorized = () =>
  NextResponse.json({ error: 'Authentication required' }, { status: 401 });

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/**
 * Calls from the local queue processor (cron.js) carry a shared secret instead of a session.
 * The secret is derived from NEXTAUTH_SECRET so both processes agree without extra config.
 */
export function internalToken(): string {
  const base = process.env.SYNTHIA_INTERNAL_TOKEN || process.env.NEXTAUTH_SECRET || '';
  return crypto.createHash('sha256').update(`synthia-internal:${base}`).digest('hex');
}

export function isInternalRequest(req: Request): boolean {
  const got = req.headers.get('x-synthia-internal') ?? '';
  const want = internalToken();
  if (!got || got.length !== want.length || !want) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
