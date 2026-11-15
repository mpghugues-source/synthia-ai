import { NextResponse } from 'next/server';
import { currentUser, unauthorized } from '@/lib/session';
import { ElevenLabsClient } from 'elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Popular voices always available on any ElevenLabs account
const FALLBACK_VOICES = [
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam',    category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  category: 'premade', labels: { gender: 'female', accent: 'American', use_case: 'narration' } },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',   category: 'premade', labels: { gender: 'female', accent: 'American', use_case: 'narration' } },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',    category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',  category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli',    category: 'premade', labels: { gender: 'female', accent: 'American', use_case: 'narration' } },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',    category: 'premade', labels: { gender: 'female', accent: 'American', use_case: 'narration' } },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam',     category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',  category: 'premade', labels: { gender: 'male',   accent: 'American', use_case: 'narration' } },
];

export async function GET() {
  if (!(await currentUser())) return unauthorized();
  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ voices: FALLBACK_VOICES, source: 'fallback' });
  }

  try {
    const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
    const res    = await client.voices.getAll();
    const voices = res.voices.map((v) => ({
      id:       v.voice_id,
      name:     v.name ?? 'Unknown',
      category: v.category ?? 'generated',
      labels:   v.labels ?? {},
      preview:  v.preview_url ?? null,
    }));
    return NextResponse.json({ voices, source: 'api' });
  } catch {
    // Key lacks voices_read permission — return fallback list
    return NextResponse.json({ voices: FALLBACK_VOICES, source: 'fallback' });
  }
}
