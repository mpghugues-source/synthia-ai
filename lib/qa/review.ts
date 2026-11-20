import { LANG_NAMES, withTextEngine, type JsonEngine } from '../groq';
import Groq from 'groq-sdk';

/**
 * Grammar, spelling, typography and phonetics review of the script BEFORE the voice is made.
 * Blocking: the text is corrected automatically, round after round, until the reviewer finds 0 error
 * (max 4 rounds). Ported from the ESENGO skill `controle-qualite-video` (review_until_clean).
 */

export interface ReviewIssue { text: string; fix: string; type: string; why: string }
export interface ReviewResult { ok: boolean; text: string; rounds: number; corrections: ReviewIssue[]; remaining: ReviewIssue[] }

const groq = () => new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

async function defaultEngine(system: string, user: string, maxTokens: number): Promise<Record<string, unknown>> {
  const c = await groq().chat.completions.create({
    model: MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0, max_tokens: maxTokens + 2500, response_format: { type: 'json_object' },
    ...(MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'medium' as const } : {}),
  });
  try { return JSON.parse(c.choices[0]?.message?.content ?? '{}'); } catch { return {}; }
}

const SYSTEM = 'You are a meticulous professional proofreader and voice-over director. You only report REAL mistakes. ' +
  'Reply only with valid JSON.';

async function reviewOnce(engine: JsonEngine, text: string, language: string): Promise<ReviewIssue[]> {
  const r = await engine(SYSTEM,
    `Proofread this ${language} voice-over script, which will be read aloud by a synthetic voice and shown as subtitles.\n` +
    `Report every real error: spelling, grammar, agreement, conjugation, punctuation and ${language} typography, wrong word, ` +
    `missing word, and anything a text-to-speech voice would read wrongly (unexpanded abbreviations, symbols like % or & , ` +
    `ambiguous numbers, emojis, URLs). Do not report style preferences.\n` +
    `Only report an error when you are CERTAIN it is wrong in standard ${language}. Never change correct idioms or fixed ` +
    `expressions (e.g. French "faire jeu égal"), proper nouns, brand names or deliberate stylistic choices. If unsure, do not report.\n` +
    `For each error give the exact erroneous excerpt copied from the text (a few words, unique in the text) and its corrected version.\n` +
    `JSON: {"errors":[{"text":"exact excerpt","fix":"corrected excerpt","type":"spelling|grammar|punctuation|typography|tts","why":"short reason"}]}\n` +
    `If there is no error, reply {"errors":[]}.\nScript:\n"""${text}"""`, 1800);
  const list = Array.isArray(r.errors) ? r.errors : [];
  return list.filter((e: unknown): e is ReviewIssue => !!e && typeof (e as ReviewIssue).text === 'string' && typeof (e as ReviewIssue).fix === 'string')
    .map((e) => ({ text: e.text, fix: e.fix, type: String(e.type ?? 'grammar'), why: String(e.why ?? '') }))
    .filter((e) => e.text.trim() && e.text !== e.fix);
}

/** Review and auto-correct until 0 error. `engine` = the user's chosen AI (Claude, ChatGPT…) or Synthia's. */
export async function reviewUntilClean(text: string, lang: string, engine: JsonEngine | null = null, maxRounds = 4): Promise<ReviewResult> {
  const language = LANG_NAMES[lang] ?? 'French';
  const eng = engine ?? defaultEngine;
  let current = text;
  const corrections: ReviewIssue[] = [];
  for (let round = 1; round <= maxRounds; round++) {
    // long texts: review in parts of ~3 500 characters, cut at sentence ends
    const parts: string[] = [];
    let buf = '';
    for (const s of current.split(/(?<=[.!?…])\s+/)) {
      if ((buf + ' ' + s).length > 3500 && buf) { parts.push(buf); buf = s; } else buf = buf ? `${buf} ${s}` : s;
    }
    if (buf) parts.push(buf);
    const issues = (await Promise.all(parts.map((p) => reviewOnce(eng, p, language).catch(() => [] as ReviewIssue[])))).flat();
    if (!issues.length) return { ok: true, text: current, rounds: round, corrections, remaining: [] };
    let applied = 0;
    for (const e of issues) {
      const idx = current.indexOf(e.text);
      if (idx < 0 || current.indexOf(e.text, idx + 1) >= 0) continue;          // only exact, unique excerpts
      // guard: a "fix" that rewrites far more than the excerpt is refused
      if (e.fix.length > e.text.length * 2 + 20) continue;
      current = current.slice(0, idx) + e.fix + current.slice(idx + e.text.length);
      corrections.push(e); applied++;
    }
    if (!applied) return { ok: false, text: current, rounds: round, corrections, remaining: issues };
    if (round === maxRounds) {
      const again = (await Promise.all(parts.map((p) => reviewOnce(eng, p, language).catch(() => [] as ReviewIssue[])))).flat();
      return { ok: again.length === 0, text: current, rounds: round, corrections, remaining: again };
    }
  }
  return { ok: false, text: current, rounds: maxRounds, corrections, remaining: [] };
}

export { withTextEngine };
