import { NextRequest, NextResponse } from 'next/server';
import { publishAll, type SocialPlatform } from '@/lib/social-upload';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { videoPath, title, description, hashtags, platforms } = await req.json();

    if (!videoPath || !platforms?.length) {
      return NextResponse.json({ error: 'videoPath and platforms are required' }, { status: 400 });
    }

    const results = await publishAll({
      videoPath,
      title: title ?? 'Synthia AI',
      description: description ?? '',
      hashtags: hashtags ?? [],
      platforms: platforms as SocialPlatform[],
    });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
