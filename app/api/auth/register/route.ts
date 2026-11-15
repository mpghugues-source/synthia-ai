import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`register:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard.' }, { status: 429 });
  }
  const { name, email, password } = await req.json().catch(() => ({}));

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255
      || typeof password !== 'string' || password.length < 8 || password.length > 200
      || (name !== undefined && (typeof name !== 'string' || name.length > 120))) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()]
  );
  if ((existing as RowDataPacket[]).length > 0) {
    return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO users (name, email, password, plan, videos_limit) VALUES (?, ?, ?, "free", 3)',
    [(name ?? email.split('@')[0]).trim().slice(0, 120), email.trim().toLowerCase(), hash]
  );

  return NextResponse.json({ success: true });
}
