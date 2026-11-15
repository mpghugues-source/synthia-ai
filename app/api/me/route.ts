import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { currentUser, unauthorized } from '@/lib/session';
import { getUsage } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Stats extends RowDataPacket { total: number; ready: number; scheduled: number; published: number; seconds: number | null }

/** Account summary for the dashboard: plan, monthly usage, and project counters. */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const usage = await getUsage(user.id);
  const [rows] = await pool.query<Stats[]>(
    `SELECT COUNT(*) total, SUM(status = 'ready') ready, SUM(publish_status = 'scheduled') scheduled,
            SUM(publish_status = 'published') published, SUM(CASE WHEN status = 'ready' THEN duration END) seconds
       FROM projects WHERE user_id = ?`, [user.id]);
  const s = rows[0];
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    usage,
    stats: {
      total: Number(s?.total ?? 0), ready: Number(s?.ready ?? 0), scheduled: Number(s?.scheduled ?? 0),
      published: Number(s?.published ?? 0), seconds: Number(s?.seconds ?? 0),
    },
  });
}
