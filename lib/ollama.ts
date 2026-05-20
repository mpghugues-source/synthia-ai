import axios from 'axios';

const BASE = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const MODEL = process.env.OLLAMA_MODEL ?? 'mistral';

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  num_predict?: number;
  lang?: 'fr' | 'en';
}

export async function generateText(prompt: string, opts: OllamaOptions = {}): Promise<string> {
  const { model = MODEL, temperature = 0.7, num_predict = 1024, lang = 'fr' } = opts;

  const systemPrompt =
    lang === 'fr'
      ? 'Tu es Synthia, un expert en création de contenu viral pour les réseaux sociaux. Réponds toujours en français sauf instruction contraire.'
      : 'You are Synthia, an expert viral content creator for social media. Always respond in English unless instructed otherwise.';

  const fullPrompt = `${systemPrompt}\n\n${prompt}`;

  const response = await axios.post(
    `${BASE}/api/generate`,
    {
      model,
      prompt: fullPrompt,
      stream: false,
      options: { temperature, num_predict },
    },
    { timeout: 600_000 }
  );

  return response.data.response as string;
}

export async function generateScript(params: {
  topic: string;
  niche: string;
  duration: number;
  platform: string;
  lang: 'fr' | 'en';
}): Promise<{ script: string; title: string; hashtags: string[] }> {
  const { topic, niche, duration, platform, lang } = params;

  const words = Math.round(duration * 2.5); // ~2.5 words/sec for voiceover
  const prompt =
    lang === 'fr'
      ? `JSON uniquement. Script ${platform} sur "${topic}". ${words} mots max. Format exact:
{"title":"titre court","script":"texte narré ${words} mots","hashtags":["#tag1","#tag2","#tag3"]}`
      : `JSON only. ${platform} script about "${topic}". Max ${words} words. Exact format:
{"title":"short title","script":"narrated text ${words} words","hashtags":["#tag1","#tag2","#tag3"]}`;

  const raw = await generateText(prompt, { lang, temperature: 0.7, num_predict: 250 });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Ollama returned non-JSON response');

  return JSON.parse(jsonMatch[0]);
}

export async function listModels(): Promise<string[]> {
  const res = await axios.get(`${BASE}/api/tags`, { timeout: 10_000 });
  return (res.data.models ?? []).map((m: { name: string }) => m.name);
}
