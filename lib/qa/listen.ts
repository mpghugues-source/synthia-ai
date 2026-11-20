import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

/**
 * "Listening" check: the voice track is transcribed locally with whisper.cpp (no API) and compared word by word
 * with the script. 100 % of the script's words must be heard as written, otherwise the video is held.
 * Ported from the ESENGO skill `controle-qualite-video`.
 */

const run = promisify(execFile);
const WHISPER = process.env.WHISPER_CLI || '/usr/local/bin/whisper-cli';
const MODEL = process.env.WHISPER_MODEL || '/root/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin';
const THREADS = String(Math.max(2, Math.min(8, os.cpus().length - 2)));

export const whisperAvailable = () => fs.existsSync(WHISPER) && fs.existsSync(MODEL);

// ── Normalisation (same idea as ESENGO: lower case, no accents/punctuation, numbers as digits) ──────────

const NUM: Record<string, Record<string, number>> = {
  fr: { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
    douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50,
    soixante: 60, cent: 100, cents: 100, mille: 1000 },
  en: { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
    twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000 },
};

export function normWords(text: string, lang = 'fr'): string[] {
  const t = text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ').replace(/[-‐–—_/]/g, ' ')
    .replace(/(\d)[ .,](?=\d{3}\b)/g, '$1')            // 1 000 / 1.000 → 1000
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const words = t.split(/\s+/).filter(Boolean);
  const table = NUM[lang.slice(0, 2)] ?? NUM.en;
  // single number words → digits, so "deux" and "2" compare equal
  return words.map((w) => (table[w] !== undefined && table[w] < 20 ? String(table[w]) : w));
}

// ── Alignment (longest common subsequence on words) ─────────────────────────

export interface ListenResult {
  ok: boolean; score: number; total: number; matched: number;
  gaps: { expected: string; heard: string }[]; heardText: string; skipped?: string;
}

/** Spelled letters ("g p t") become one token ("gpt"), as in the ESENGO normalisation. */
function joinLetters(words: string[]): string[] {
  const out: string[] = [];
  let inRun = false;                       // last token was built only from single letters
  for (const w of words) {
    const letter = w.length === 1 && /\p{L}/u.test(w);
    if (letter && inRun) out[out.length - 1] += w;
    else out.push(w);
    inRun = letter;
  }
  return out;
}

/**
 * Same word cut differently by the script and by whisper ("chat gpt" / "chatgpt", "open ai" / "openai"):
 * glue two neighbouring tokens of one side when the result is a token of the other side.
 */
function glue(a: string[], b: string[]): string[] {
  const vocab = new Set(b);
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    if (i + 1 < a.length && !vocab.has(a[i]) && vocab.has(a[i] + a[i + 1])) { out.push(a[i] + a[i + 1]); i++; }
    else out.push(a[i]);
  }
  return out;
}

export function compareWords(expectedIn: string[], heardIn: string[]): Omit<ListenResult, 'ok' | 'heardText'> {
  let expected = joinLetters(expectedIn), heard = joinLetters(heardIn);
  heard = glue(heard, expected); expected = glue(expected, heard);
  const n = expected.length, m = heard.length;
  // DP on two rows for the length; then a full table only when small enough to backtrack
  if (n * m > 4_000_000) {
    const hs = new Set(heard);
    const matched = expected.filter((w) => hs.has(w)).length;
    return { score: n ? matched / n : 1, total: n, matched, gaps: [] };
  }
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = expected[i] === heard[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const gaps: { expected: string; heard: string }[] = [];
  let i = 0, j = 0, matched = 0;
  let missE: string[] = [], missH: string[] = [];
  const flush = () => {
    if (missE.length) gaps.push({ expected: missE.join(' '), heard: missH.join(' ') || '—' });
    missE = []; missH = [];
  };
  while (i < n && j < m) {
    if (expected[i] === heard[j]) { flush(); matched++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { missE.push(expected[i]); i++; }
    else { missH.push(heard[j]); j++; }
  }
  while (i < n) missE.push(expected[i++]);
  while (j < m) missH.push(heard[j++]);
  flush();
  return { score: n ? matched / n : 1, total: n, matched, gaps: gaps.slice(0, 50) };
}

/** Transcribe an audio or video file with whisper.cpp (16 kHz mono WAV first). */
export async function transcribe(file: string, lang: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'synthia-qa-'));
  try {
    const wav = path.join(tmp, 'a.wav');
    await run('ffmpeg', ['-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { timeout: 600_000 });
    const out = path.join(tmp, 'out');
    await run(WHISPER, ['-m', MODEL, '-f', wav, '-l', /^[a-z]{2}$/.test(lang) ? lang : 'auto', '-t', THREADS, '-nt', '-otxt', '-of', out],
      { timeout: 3 * 3600_000, maxBuffer: 64 * 1024 * 1024 });
    return fs.readFileSync(`${out}.txt`, 'utf8').trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Listen to the voice and compare with the script. Requires 100 % (ESENGO rule for language videos, now for all). */
export async function listenCheck(audio: string, script: string, lang: string, required = 1): Promise<ListenResult> {
  if (!whisperAvailable()) return { ok: false, score: 0, total: 0, matched: 0, gaps: [], heardText: '', skipped: 'whisper_missing' };
  const heardText = await transcribe(audio, lang);
  const r = compareWords(normWords(script, lang), normWords(heardText, lang));
  return { ...r, ok: r.score >= required, heardText: heardText.slice(0, 20000) };
}
