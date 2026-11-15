import fs from 'fs';
import path from 'path';
import { extractScenePrompts } from './groq';

const STABILITY_API = 'https://api.stability.ai/v2beta/stable-image/generate/core';

export function stabilityEnabled(): boolean {
  return Boolean(process.env.STABILITY_API_KEY);
}

export async function generateImage(opts: {
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  outputPath: string;
}): Promise<string> {
  const { prompt, aspectRatio = '9:16', outputPath } = opts;

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('aspect_ratio', aspectRatio);
  form.append('output_format', 'jpeg');

  const res = await fetch(STABILITY_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
      Accept: 'image/*',
    },
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Stability AI ${res.status}: ${msg}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
  return outputPath;
}

export async function generateImagesFromScript(opts: {
  script: string;
  title?: string | null;
  resolution: '1080x1920' | '1920x1080' | '1080x1080';
  outputDir: string;
  jobId: string;
  count?: number;
  style?: string;
}): Promise<string[]> {
  const { script, title, resolution, outputDir, jobId, count = 4, style = 'photorealistic, cinematic, dramatic lighting, 8K ultra HD' } = opts;

  let prompts: string[] = [];
  try {
    prompts = await extractScenePrompts(script, count, style);
  } catch (e) {
    console.error('[stability] scene extraction failed:', e);
  }
  if (!prompts.length) prompts = [`${title ?? 'cinematic scene'}, ${style}`];

  const ar = resolution === '1920x1080' ? '16:9' : resolution === '1080x1080' ? '1:1' : '9:16';

  const imagePaths: string[] = [];
  for (let i = 0; i < Math.min(prompts.length, count); i++) {
    const imgPath = path.join(outputDir, `img_${jobId}_${i}.jpg`);
    try {
      await generateImage({ prompt: prompts[i], aspectRatio: ar, outputPath: imgPath });
      imagePaths.push(imgPath);
      console.log(`[stability] image ${i + 1}/${count} generated`);
    } catch (e) {
      console.error(`[stability] image ${i + 1} failed:`, e);
    }
  }

  return imagePaths;
}
