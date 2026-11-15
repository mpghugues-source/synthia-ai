import fs from 'fs';
import Groq from 'groq-sdk';

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface VerboseTranscription {
  text: string;
  duration?: number;
  words?: WordTimestamp[];
  segments?: Array<{ text: string; start: number; end: number }>;
}

const WORDS_PER_LINE = 6;

export async function transcribeWithTimestamps(audioPath: string): Promise<{
  words: WordTimestamp[];
  duration: number;
  text: string;
}> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Cast to unknown first to bypass SDK type mismatch for verbose_json + word timestamps
  const create = client.audio.transcriptions.create.bind(client.audio.transcriptions) as unknown as (
    opts: Record<string, unknown>
  ) => Promise<VerboseTranscription>;

  const result = await create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-large-v3-turbo',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  const words: WordTimestamp[] = result.words ?? [];
  const duration = result.duration ?? (words.at(-1)?.end ?? 0);

  return { words, duration, text: result.text ?? '' };
}

function toSRTTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function buildSRTFromWords(words: WordTimestamp[]): string {
  if (words.length === 0) return '';

  let srt = '';
  let idx = 1;
  let i   = 0;

  while (i < words.length) {
    const group = words.slice(i, i + WORDS_PER_LINE);
    const start = group[0].start;
    const end   = group.at(-1)!.end;
    const text  = group.map((w) => w.word).join(' ').trim();

    srt += `${idx}\n${toSRTTime(start)} --> ${toSRTTime(end)}\n${text}\n\n`;
    idx++;
    i += WORDS_PER_LINE;
  }

  return srt;
}

export async function generateWordSRT(audioPath: string, srtOutputPath: string): Promise<{
  srtPath: string;
  duration: number;
  text: string;
}> {
  const { words, duration, text } = await transcribeWithTimestamps(audioPath);

  let srtContent: string;
  if (words.length > 0) {
    srtContent = buildSRTFromWords(words);
  } else {
    // Fallback: uniform distribution using segments if available
    srtContent = text.split(/[.!?]+/).filter(Boolean).map((seg, i, arr) => {
      const segDuration = duration / arr.length;
      const start = i * segDuration;
      const end   = (i + 1) * segDuration;
      return `${i + 1}\n${toSRTTime(start)} --> ${toSRTTime(end)}\n${seg.trim()}\n`;
    }).join('\n');
  }

  fs.writeFileSync(srtOutputPath, srtContent, 'utf-8');
  return { srtPath: srtOutputPath, duration, text };
}
