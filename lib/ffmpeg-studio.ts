import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface RenderOptions {
  voiceoverPath: string;
  musicPath?: string;
  stockClipsDir: string;
  outputPath: string;
  subtitleText?: string;
  duration?: number;
  musicVolume?: number;
  resolution?: '1080x1920' | '1920x1080' | '1080x1080';
}

export interface SRTSegment {
  index: number;
  start: string;
  end: string;
  text: string;
}

function buildSRT(words: string[], totalDuration: number): string {
  const wordsPerSecond = words.length / totalDuration;
  let srt = '';
  let timeOffset = 0;

  words.forEach((word, i) => {
    const wordDuration = 1 / wordsPerSecond;
    const startMs = Math.round(timeOffset * 1000);
    timeOffset += wordDuration;
    const endMs = Math.round(timeOffset * 1000);

    const fmt = (ms: number) => {
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      const cs = ms % 1000;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(cs).padStart(3, '0')}`;
    };

    srt += `${i + 1}\n${fmt(startMs)} --> ${fmt(endMs)}\n${word}\n\n`;
  });

  return srt;
}

export function generateSRT(scriptText: string, outputPath: string, totalDuration: number): string {
  const words = scriptText.replace(/\s+/g, ' ').trim().split(' ');
  const content = buildSRT(words, totalDuration);
  fs.writeFileSync(outputPath, content, 'utf-8');
  return outputPath;
}

function pickClips(dir: string, targetDuration: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const exts = ['.mp4', '.mov', '.webm', '.mkv'];
  const files = fs.readdirSync(dir)
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f));

  const shuffled = files.sort(() => Math.random() - 0.5);
  const selected: string[] = [];
  let acc = 0;

  for (const clip of shuffled) {
    selected.push(clip);
    acc += 5;
    if (acc >= targetDuration) break;
  }

  return selected;
}

export function renderVideo(opts: RenderOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const {
      voiceoverPath,
      musicPath,
      stockClipsDir,
      outputPath,
      subtitleText,
      duration = 60,
      musicVolume = 0.2,
      resolution = '1080x1920',
    } = opts;

    const [width, height] = resolution.split('x').map(Number);
    const srtPath = voiceoverPath.replace(/\.\w+$/, '.srt');
    const clips = pickClips(stockClipsDir, duration);

    if (subtitleText) {
      generateSRT(subtitleText, srtPath, duration);
    }

    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    let cmd = ffmpeg();

    // Input clips (loop/concat to fill duration)
    if (clips.length > 0) {
      clips.forEach((c) => cmd.input(c));
    } else {
      // Black background fallback
      cmd.input(`color=black:s=${resolution}:d=${duration}`).inputOptions(['-f', 'lavfi']);
    }

    // Voiceover
    cmd.input(voiceoverPath);

    // Background music
    if (musicPath && fs.existsSync(musicPath)) {
      cmd.input(musicPath);
    }

    // Video filter: scale + concat clips + pad
    const videoFilter: ffmpeg.FilterSpecification[] = [];

    if (clips.length > 0) {
      clips.forEach((_, i) => {
        videoFilter.push({
          filter: 'scale',
          options: { w: width, h: height, force_original_aspect_ratio: 'cover' },
          inputs: `[${i}:v]`,
          outputs: `[v${i}]`,
        });
      });

      const concatInputs = clips.map((_, i) => `[v${i}]`).join('');
      videoFilter.push({
        filter: 'concat',
        options: { n: clips.length, v: 1, a: 0 },
        inputs: concatInputs,
        outputs: '[vconcat]',
      });
    }

    // Subtitles via drawtext filter if SRT exists
    if (subtitleText && fs.existsSync(srtPath)) {
      const subtitleFilter = `subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='FontSize=28,PrimaryColour=&Hffffff,Bold=1,Shadow=2'`;
      videoFilter.push({
        filter: subtitleFilter,
        inputs: clips.length > 0 ? '[vconcat]' : '[0:v]',
        outputs: '[vout]',
      });
    }

    const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));
    const voiceInput = clips.length > 0 ? clips.length : 1;
    const musicInput = hasMusic ? voiceInput + 1 : null;

    // Determine video output label
    const hasSubtitles = Boolean(subtitleText && fs.existsSync(srtPath));
    const videoOutLabel = videoFilter.length > 0 ? (hasSubtitles ? '[vout]' : '[vconcat]') : null;
    // If no video filter at all (no clips, no subtitles), use raw input stream
    const videoMapArg = videoOutLabel ?? '0:v';

    // Audio: mix voice + music, or just voice
    let audioMapArg: string;
    const allFilters: (ffmpeg.FilterSpecification | string)[] = [...videoFilter];

    if (musicInput !== null) {
      allFilters.push(
        `[${voiceInput}:a]volume=1.0[voice]`,
        `[${musicInput}:a]volume=${musicVolume}[music]`,
        '[voice][music]amix=inputs=2:duration=first[aout]'
      );
      audioMapArg = '[aout]';
    } else {
      audioMapArg = `${voiceInput}:a`;
    }

    const outputOptions = [
      '-map', videoMapArg,
      '-map', audioMapArg,
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
    ];

    if (allFilters.length > 0) cmd.complexFilter(allFilters as ffmpeg.FilterSpecification[]);

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', (cmdLine: string) => console.log('[FFmpeg] Start:', cmdLine))
      .on('progress', (p: { percent?: number }) =>
        console.log(`[FFmpeg] Progress: ${Math.round(p.percent ?? 0)}%`)
      )
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
