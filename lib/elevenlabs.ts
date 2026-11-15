import { ElevenLabsClient } from 'elevenlabs';
import fs from 'fs';

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

// eleven_multilingual_v2 supports FR, EN, ES, DE, PT, AR, etc.
const MODEL_ID = 'eleven_multilingual_v2';

// Default voice IDs (free tier)
const DEFAULT_VOICES: Record<string, string> = {
  fr: 'TX3LPaxmHKxFdv7VOQHJ', // Liam — neutral, works well in French
  en: 'pNInz6obpgDQGcFmaJgB', // Adam — clear English
};

export async function synthesizeElevenLabs(opts: {
  text: string;
  language?: string;
  voiceId?: string;
  outputPath: string;
}): Promise<string> {
  const { text, language = 'fr', voiceId, outputPath } = opts;
  const voice = voiceId ?? DEFAULT_VOICES[language] ?? DEFAULT_VOICES.fr;

  const audioStream = await client.textToSpeech.convert(voice, {
    text,
    model_id: MODEL_ID,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  return outputPath;
}

export async function listVoices() {
  const res = await client.voices.getAll();
  return res.voices.map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels }));
}
