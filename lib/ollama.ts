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
    { timeout: 120_000 }
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

  const prompt =
    lang === 'fr'
      ? `Génère un script ${platform} de ${duration} secondes sur le sujet "${topic}" dans la niche "${niche}".
Format de réponse JSON strict :
{
  "title": "titre accrocheur de 60 caractères max",
  "script": "script complet narré, optimisé pour la voix-off",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}`
      : `Generate a ${duration}-second ${platform} script on the topic "${topic}" in the "${niche}" niche.
Strict JSON response format:
{
  "title": "catchy title max 60 chars",
  "script": "full narrated script, optimized for voiceover",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"]
}`;

  const raw = await generateText(prompt, { lang, temperature: 0.8, num_predict: 1500 });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Ollama returned non-JSON response');

  return JSON.parse(jsonMatch[0]);
}

export async function listModels(): Promise<string[]> {
  const res = await axios.get(`${BASE}/api/tags`, { timeout: 10_000 });
  return (res.data.models ?? []).map((m: { name: string }) => m.name);
}
