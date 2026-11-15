import Groq from 'groq-sdk';

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// llama-3.3-70b-versatile was retired from Groq; gpt-oss-120b is the strongest model available here.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// gpt-oss is a reasoning model: keep reasoning short (speed) and leave room for it in max_tokens.
const REASONING = MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' as const } : {};
const budget = (n: number) => (MODEL.startsWith('openai/gpt-oss') ? n + 2000 : n);

export const LANG_NAMES: Record<string, string> = {
  fr: 'French', en: 'English', es: 'Spanish', pt: 'Portuguese', sw: 'Swahili',
  de: 'German', it: 'Italian', ar: 'Arabic',
};

export async function generateScriptGroq(params: {
  topic: string;
  niche: string;
  duration: number;
  platform: string;
  lang: string;
  hook?: string;
  tone?: string;
}): Promise<{ script: string; title: string; hashtags: string[] }> {
  const { topic, niche, duration, platform, lang } = params;
  const words = Math.round(duration * 2.5);
  const language = LANG_NAMES[lang] ?? 'French';
  const hook = typeof params.hook === 'string' ? params.hook.slice(0, 300) : '';
  const tone = typeof params.tone === 'string' ? params.tone.slice(0, 200) : '';

  const systemPrompt =
    'You are Synthia, a viral short-form video scriptwriter. Structure every script as: a scroll-stopping hook ' +
    'in the first sentence, fast-paced value, and a clear call to action at the end. Reply only in valid JSON, no markdown.';

  const userPrompt =
    `Write a ${platform} voice-over script in ${language} about "${topic}" (niche: ${niche}). ` +
    `Maximum ${words} words, spoken naturally, no stage directions or emojis in the script.` +
    (hook ? ` Start with this exact hook: "${hook}".` : '') +
    (tone ? ` Brand tone of voice: ${tone}.` : '') +
    ` Title and hashtags must also be in ${language}. Exact JSON:\n` +
    `{"title":"short catchy title","script":"narrated text","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: budget(900),
    ...REASONING,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  return {
    title:    parsed.title    ?? topic,
    script:   parsed.script   ?? raw,
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).slice(0, 15) : [],
  };
}

// ── Viral Lab: fast text tools ───────────────────────────────────────────────

export type ViralTool = 'hooks' | 'titles' | 'captions' | 'ideas' | 'rewrite' | 'translate' | 'hashtags';

async function askJson(system: string, user: string, maxTokens = 1400, temperature = 0.8): Promise<Record<string, unknown>> {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature,
    max_tokens: budget(maxTokens),
    ...REASONING,
    response_format: { type: 'json_object' },
  });
  try { return JSON.parse(completion.choices[0]?.message?.content ?? '{}'); } catch { return {}; }
}

/**
 * One entry point for the Viral Lab tools. `input` is the topic or the script, depending on the tool.
 * Everything the user typed is passed as quoted data inside the prompt.
 */
export async function viralTool(params: {
  tool: ViralTool; input: string; lang: string; platform?: string; targetLang?: string; tone?: string; style?: string;
}): Promise<Record<string, unknown>> {
  const language = LANG_NAMES[params.lang] ?? 'French';
  const input = params.input.slice(0, 12000);
  const platform = (params.platform ?? 'TikTok').slice(0, 40);
  const tone = params.tone ? ` Brand tone: ${params.tone.slice(0, 200)}.` : '';
  const sys = 'You are Synthia, an expert in viral short-form video strategy (TikTok, Reels, Shorts, YouTube, X). ' +
    'You know retention psychology, curiosity gaps and platform algorithms. Write every text value in the requested ' +
    'output language (only JSON keys stay in English). Reply only in valid JSON, no markdown.';

  switch (params.tool) {
    case 'hooks':
      return askJson(sys, `Topic: """${input}"""\nWrite 10 different opening hooks (max 15 words each) in ${language} for a ${platform} video.` +
        ` Mix types: question, bold claim, statistic, story, contrarian, warning, curiosity gap.${tone}` +
        ` Score each from 1 to 10 for its scroll-stopping power and explain the score in a few words.` +
        ` JSON: {"hooks":[{"text":"...","type":"question","score":8,"why":"..."}]} sorted by score descending.`);
    case 'titles':
      return askJson(sys, `Video subject: """${input}"""\nWrite 8 title variants in ${language} for A/B testing on ${platform}` +
        ` (max 70 characters each), from safe to bold, plus a one-line thumbnail text idea for each (max 5 words).${tone}` +
        ` JSON: {"titles":[{"title":"...","thumbnail":"...","angle":"curiosity"}]}`);
    case 'captions':
      return askJson(sys, `Video script: """${input}"""\nWrite publish-ready copy in ${language} for each platform, adapted to its codes:` +
        ` youtube (title max 90 chars + description with 3 short paragraphs and a call to action), tiktok (caption max 150 chars),` +
        ` instagram (caption with line breaks and emojis, call to action), facebook (post), x (a thread of 3 tweets, max 270 chars each),` +
        ` linkedin (professional post). Add 5 to 8 relevant hashtags per platform.${tone}` +
        ` JSON: {"youtube":{"title":"","description":"","hashtags":[]},"tiktok":{"caption":"","hashtags":[]},` +
        `"instagram":{"caption":"","hashtags":[]},"facebook":{"post":"","hashtags":[]},"x":{"thread":["","",""],"hashtags":[]},` +
        `"linkedin":{"post":"","hashtags":[]}}`, 2500, 0.7);
    case 'ideas':
      return askJson(sys, `Niche: """${input}"""\nPlan 14 short video ideas in ${language} for ${platform} (two weeks of daily posts), mixing` +
        ` education, storytelling, myths vs facts, lists, behind the scenes and trends.${tone}` +
        ` JSON: {"ideas":[{"day":1,"topic":"...","hook":"...","format":"list","duration":45}]}`, 2500);
    case 'rewrite': {
      const styles: Record<string, string> = {
        shorter: 'Make it about 40% shorter while keeping the key points.',
        punchier: 'Make it punchier: short sentences, strong verbs, a stronger hook, a clear call to action.',
        storytelling: 'Rewrite it as a short story with a character, tension and a payoff.',
        simpler: 'Rewrite it so a 12-year-old understands it.',
        professional: 'Rewrite it in a confident, professional tone.',
        funny: 'Rewrite it with light humour while keeping the information.',
      };
      const how = styles[params.style ?? 'punchier'] ?? styles.punchier;
      return askJson(sys, `Voice-over script: """${input}"""\n${how} Write it in ${language}.${tone}` +
        ` Keep it as spoken text without stage directions. JSON: {"script":"...","changes":["what changed, short"]}`, 2500, 0.7);
    }
    case 'translate': {
      const target = LANG_NAMES[params.targetLang ?? 'en'] ?? 'English';
      return askJson(sys, `Translate this voice-over script into natural, spoken ${target}, adapting idioms and keeping the rhythm` +
        ` of short-form video: """${input}"""\nJSON: {"script":"...","title":"a short title in ${target}"}`, 3000, 0.3);
    }
    case 'hashtags':
      return askJson(sys, `Topic: """${input}"""\nSuggest hashtags in ${language} for ${platform}, grouped by reach:` +
        ` 5 broad (high volume), 8 niche (medium), 5 micro-niche (low competition). Also give the best posting times` +
        ` (local time) for this audience. JSON: {"broad":[],"niche":[],"micro":[],"bestTimes":["Tue 18:00"],"tip":"..."}`, 1000, 0.6);
  }
}

export interface TrendSuggestion {
  topic: string;
  hook: string;
  whyTrending: string;
}

/**
 * Idées de sujets vidéo ancrées dans des tendances réelles — via Groq (cloud,
 * quasi instantané) plutôt qu'Ollama local (CPU-only, plusieurs minutes sur
 * ce serveur pour une sortie de taille comparable).
 */
export async function suggestViralTopicsGroq(params: {
  niche: string;
  market: string;
  trends: { title: string; articleTitle?: string }[];
  lang: 'fr' | 'en';
  count?: number;
}): Promise<TrendSuggestion[]> {
  const { niche, market, trends, lang, count = 5 } = params;
  const trendList = trends
    .slice(0, 15)
    .map((t) => `- ${t.title}${t.articleTitle ? ` (${t.articleTitle})` : ''}`)
    .join('\n');

  const systemPrompt = lang === 'fr'
    ? 'Tu es Synthia, experte en création de contenu viral. Réponds uniquement en JSON valide, sans markdown.'
    : 'You are Synthia, a viral content expert. Reply only in valid JSON, no markdown.';

  const userPrompt = lang === 'fr'
    ? `Tendances de recherche réelles sur le marché ${market} aujourd'hui :\n${trendList}\n\nPour la niche "${niche}", propose ${count} idées de vidéos courtes qui s'appuient sur ces tendances (même indirectement). JSON exact:\n{"suggestions":[{"topic":"sujet vidéo concret","hook":"première phrase accrocheuse","whyTrending":"lien avec la tendance en une phrase"}]}`
    : `Today's real search trends in the ${market} market:\n${trendList}\n\nFor the "${niche}" niche, suggest ${count} short video ideas tying into these trends (even indirectly). Exact JSON:\n{"suggestions":[{"topic":"concrete video topic","hook":"catchy first line","whyTrending":"one-sentence link to the trend"}]}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.8,
    max_tokens: budget(700),
    ...REASONING,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);
  return parsed.suggestions ?? [];
}

// ── Spelling & grammar correction ────────────────────────────────────────────

/** Split on paragraph (then sentence) boundaries into pieces of at most `max` characters. */
function chunkText(text: string, max = 3500): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/(\n+)/)) {
    if ((cur + para).length <= max) { cur += para; continue; }
    if (cur) out.push(cur);
    if (para.length <= max) { cur = para; continue; }
    cur = '';
    for (const sentence of para.split(/(?<=[.!?…])\s+/)) {
      if ((cur + ' ' + sentence).length > max && cur) { out.push(cur); cur = sentence; }
      else cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function proofreadChunk(chunk: string, language: string): Promise<string> {
  if (!chunk.trim()) return chunk;
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content:
        `You are a meticulous ${language} proofreader. Fix spelling mistakes, typos, grammar, agreement, accents and ` +
        'punctuation ONLY. Never rephrase, shorten, translate, censor or add anything; keep the wording, style, names, ' +
        'archaic or biblical vocabulary, numbers and line breaks exactly as they are. If the text is already correct, ' +
        'return it unchanged. Output only the corrected text, with no comment or quotes.' },
      { role: 'user', content: chunk },
    ],
    temperature: 0,
    max_tokens: budget(Math.ceil(chunk.length / 2) + 200),
    ...REASONING,
  });
  const fixed = completion.choices[0]?.message?.content ?? '';
  // Safety net: a proofread keeps roughly the same length. Anything else means the model drifted.
  const ratio = fixed.length / chunk.length;
  if (!fixed.trim() || ratio < 0.85 || ratio > 1.15) return chunk;
  // Keep the original leading/trailing whitespace (line breaks between chunks).
  const lead = chunk.match(/^\s*/)?.[0] ?? '';
  const trail = chunk.match(/\s*$/)?.[0] ?? '';
  return lead + fixed.trim() + trail;
}

/** Correct spelling and grammar without rewriting. Returns the corrected text and a change count. */
export async function proofreadText(text: string, lang: string): Promise<{ text: string; changes: number }> {
  const language = LANG_NAMES[lang] ?? 'French';
  const chunks = chunkText(text);
  const fixed: string[] = [];
  for (let i = 0; i < chunks.length; i += 4) {
    fixed.push(...await Promise.all(chunks.slice(i, i + 4).map((c) => proofreadChunk(c, language).catch(() => c))));
  }
  const result = fixed.join('');
  // Count corrected words: words of the result that do not exist (as often) in the original.
  const pool = new Map<string, number>();
  for (const w of text.split(/\s+/)) pool.set(w, (pool.get(w) ?? 0) + 1);
  let changes = 0;
  for (const w of result.split(/\s+/)) {
    const n = pool.get(w) ?? 0;
    if (n > 0) pool.set(w, n - 1); else changes++;
  }
  return { text: result, changes };
}

/** Visual scene prompts for image generation, extracted from a script. */
export async function extractScenePrompts(script: string, count: number, style: string): Promise<string[]> {
  const r = await askJson(
    'You write prompts for an AI image generator. Prompts are in English, concrete and visual. Reply only in valid JSON.',
    `From this text, extract ${count} vivid visual scene descriptions, one per key moment, in story order. ` +
    `No text, letters or logos in the images. End each prompt with: "${style.slice(0, 200)}". ` +
    `JSON: {"prompts":["..."]}\nText:\n"""${script.slice(0, 4000)}"""`, 1200, 0.7);
  return Array.isArray(r.prompts) ? r.prompts.map(String).slice(0, count) : [];
}
