import { ElevenLabsClient } from 'elevenlabs';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { synthesizeAndSave } from '@/lib/xtts';
import { stripChunkSilence, enhanceVoiceAudio } from '@/lib/audio-postprocess';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const EL_CHUNK_SIZE   = 4500;  // ElevenLabs chars per request
const XTTS_CHUNK_SIZE = 200;   // XTTS chars per request (~8-10s audio, safe under CPU timeout)

function splitIntoChunks(text: string, maxLen: number): string[] {
  const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
  const sentences     = text.match(sentenceRegex) ?? [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      if (current) { chunks.push(current.trim()); current = ''; }
      const words = sentence.split(' ');
      let buf = '';
      for (const word of words) {
        if ((buf + ' ' + word).length > maxLen && buf) {
          chunks.push(buf.trim());
          buf = word;
        } else {
          buf += (buf ? ' ' : '') + word;
        }
      }
      if (buf) current = buf;
    } else if ((current + sentence).length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    (ffmpeg as unknown as {
      ffprobe: (p: string, cb: (e: Error | null, d: { format: { duration?: number } }) => void) => void
    }).ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data.format.duration ?? 0);
    });
  });
}

async function concatAudioFiles(chunkPaths: string[], outputPath: string, outputDir: string, jobId: string): Promise<void> {
  const listPath = path.join(outputDir, `concat_${jobId}.txt`);
  fs.writeFileSync(listPath, chunkPaths.map((p) => `file '${p}'`).join('\n'));
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .output(outputPath)
      .outputOptions(['-c', 'copy'])
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
  for (const p of chunkPaths) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
  try { fs.unlinkSync(listPath); } catch { /* ignore */ }
}

// ─── ElevenLabs synthesis ─────────────────────────────────────────────────────

async function synthesizeElChunk(
  client: ElevenLabsClient,
  text: string,
  voiceId: string,
  outputPath: string
): Promise<void> {
  const stream = await client.textToSpeech.convert(voiceId, {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });
  const buffers: Buffer[] = [];
  for await (const chunk of stream) {
    buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  fs.writeFileSync(outputPath, Buffer.concat(buffers));
}

async function synthesizeWithElevenLabs(opts: {
  text: string; voiceId: string; outputPath: string; outputDir: string; jobId: string;
}): Promise<{ outputPath: string; duration: number }> {
  const { text, voiceId, outputPath, outputDir, jobId } = opts;
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const chunks = splitIntoChunks(text, EL_CHUNK_SIZE);
  console.log(`[tts-el] ${chunks.length} chunk(s) for ${text.length} chars`);

  if (chunks.length === 1) {
    await synthesizeElChunk(client, chunks[0], voiceId, outputPath);
    return { outputPath, duration: await getAudioDuration(outputPath) };
  }

  const chunkPaths: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const cp = path.join(outputDir, `voice_${jobId}_el${i}.mp3`);
    await synthesizeElChunk(client, chunks[i], voiceId, cp);
    chunkPaths.push(cp);
    console.log(`[tts-el] chunk ${i + 1}/${chunks.length} done`);
  }
  await concatAudioFiles(chunkPaths, outputPath, outputDir, jobId);
  return { outputPath, duration: await getAudioDuration(outputPath) };
}

// ─── XTTS synthesis (fallback) ────────────────────────────────────────────────

async function synthesizeWithXTTS(opts: {
  text: string; language: string; outputPath: string; outputDir: string; jobId: string;
}): Promise<{ outputPath: string; duration: number }> {
  const { text, language, outputPath, outputDir, jobId } = opts;
  const chunks = splitIntoChunks(text, XTTS_CHUNK_SIZE);
  console.log(`[tts-xtts] ${chunks.length} chunk(s) for ${text.length} chars`);

  const rawPath = outputPath.replace(/\.wav$/, '_raw.wav');

  if (chunks.length === 1) {
    await synthesizeAndSave({ text: chunks[0], language }, rawPath);
  } else {
    const chunkPaths: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const cp = path.join(outputDir, `voice_${jobId}_xtts${i}.wav`);
      await synthesizeAndSave({ text: chunks[i], language }, cp);
      await stripChunkSilence(cp);  // trim dead air from each chunk edge
      chunkPaths.push(cp);
      console.log(`[tts-xtts] chunk ${i + 1}/${chunks.length} done`);
    }
    await concatAudioFiles(chunkPaths, rawPath, outputDir, jobId);
  }

  // Denoise + normalize the full track
  console.log('[tts-xtts] enhancing audio...');
  await enhanceVoiceAudio(rawPath, outputPath);
  try { fs.unlinkSync(rawPath); } catch { /* ignore */ }

  return { outputPath, duration: await getAudioDuration(outputPath) };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function synthesizeLongText(opts: {
  text: string;
  voiceId?: string;
  language?: string;
  outputPath: string;
  outputDir: string;
  jobId: string;
  /** If true, throw on ElevenLabs failure instead of falling back to XTTS */
  noFallback?: boolean;
}): Promise<{ outputPath: string; duration: number; engine: 'elevenlabs' | 'xtts' }> {
  const { text, voiceId = 'TX3LPaxmHKxFdv7VOQHJ', language = 'fr', outputPath, outputDir, jobId, noFallback = false } = opts;

  // Try ElevenLabs first if key is present
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const result = await synthesizeWithElevenLabs({ text, voiceId, outputPath, outputDir, jobId });
      return { ...result, engine: 'elevenlabs' };
    } catch (e) {
      if (noFallback) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[tts] ElevenLabs failed (${msg}), falling back to XTTS`);
      try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
    }
  }

  if (noFallback) throw new Error('No ElevenLabs API key configured');

  // Fallback: XTTS
  console.log('[tts] Using XTTS');
  const xttsPath = outputPath.replace(/\.(mp3|wav)$/, '.wav');
  const result = await synthesizeWithXTTS({ text, language, outputPath: xttsPath, outputDir, jobId });
  return { ...result, outputPath: xttsPath, engine: 'xtts' };
}
