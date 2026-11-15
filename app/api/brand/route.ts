import { NextRequest, NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { getBrandKit, saveBrandKit, CAPTION_STYLES, type CaptionStyle } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANGS = ['fr', 'en', 'es', 'pt', 'sw', 'de', 'it', 'ar'];
const FORMATS = ['1080x1920', '1920x1080', '1080x1080'];

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ brand: await getBrandKit(user.id) });
}

export async function PUT(req: NextRequest) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const kit = {
    watermark: str(b.watermark, 60),
    captionStyle: (CAPTION_STYLES as string[]).includes(b.captionStyle) ? b.captionStyle as CaptionStyle : 'box' as CaptionStyle,
    defaultLang: LANGS.includes(b.defaultLang) ? b.defaultLang : 'fr',
    defaultFormat: FORMATS.includes(b.defaultFormat) ? b.defaultFormat : '1080x1920',
    defaultVoice: typeof b.defaultVoice === 'string' && /^[A-Za-z0-9]{10,40}$/.test(b.defaultVoice) ? b.defaultVoice : null,
    tone: str(b.tone, 255),
  };
  await saveBrandKit(user.id, kit);
  return NextResponse.json({ brand: kit });
}
