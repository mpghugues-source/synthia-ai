import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface RenderOptions {
  voiceoverPath: string;
  musicPath?: string;
  stockClipsDir?: string;
  imagePaths?: string[];   // user-provided images or AI-generated
  clipPaths?: string[];    // user-provided video clips
  outputPath: string;
  subtitleText?: string;
  srtPath?: string;        // pre-built SRT (e.g. from Whisper) — overrides subtitleText
  duration?: number;
  musicVolume?: number;
  resolution?: '1080x1920' | '1920x1080' | '1080x1080';
  captionStyle?: 'box' | 'bold' | 'minimal' | 'neon' | 'none';
  watermark?: string | null;  // brand handle drawn in a corner (e.g. "@mychannel")
}

const WATERMARK_FONT = '/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf';

// ─── Caption styles (ASS, in real video pixels) ──────────────────────────────
// ASS colours are &HAABBGGRR. Sizes are for a 1080-px short side and scaled to the video.
interface CaptionLook {
  size: number; primary: string; outline: string; back: string; bold: boolean;
  borderStyle: 1 | 3; outlineW: number; shadow: number; marginV: number; // marginV as a share of height
}
const CAPTION_LOOKS: Record<string, CaptionLook> = {
  box:     { size: 62, primary: '&H00FFFFFF', outline: '&H50000000', back: '&H50000000', bold: true,  borderStyle: 3, outlineW: 14, shadow: 0, marginV: 0.14 },
  bold:    { size: 86, primary: '&H0000E5FF', outline: '&H00000000', back: '&H80000000', bold: true,  borderStyle: 1, outlineW: 7,  shadow: 4, marginV: 0.30 },
  minimal: { size: 52, primary: '&H00FFFFFF', outline: '&H80000000', back: '&H00000000', bold: false, borderStyle: 1, outlineW: 2,  shadow: 2, marginV: 0.08 },
  neon:    { size: 74, primary: '&H00FF7AF2', outline: '&H00FFE000', back: '&H00000000', bold: true,  borderStyle: 1, outlineW: 4,  shadow: 0, marginV: 0.24 },
};

function srtTimeToAss(t: string): string {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(t);
  if (!m) return '0:00:00.00';
  const cs = Math.floor(Number(m[4].padEnd(3, '0').slice(0, 3)) / 10);
  return `${Number(m[1])}:${m[2]}:${m[3]}.${String(cs).padStart(2, '0')}`;
}

/** Convert an SRT file to ASS with PlayRes = video size, so styles are exact pixel values. */
export function srtToAss(srtPath: string, assPath: string, style: string, width: number, height: number): string {
  const look = CAPTION_LOOKS[style] ?? CAPTION_LOOKS.box;
  const k = Math.min(width, height) / 1080;
  const size = Math.round(look.size * k);
  const marginV = Math.round(height * look.marginV);
  const marginH = Math.round(width * 0.07);
  const header = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`,
    'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,DejaVu Sans,${size},${look.primary},&H000000FF,${look.outline},${look.back},${look.bold ? -1 : 0},0,0,0,100,100,0,0,${look.borderStyle},${Math.round(look.outlineW * k)},${Math.round(look.shadow * k)},2,${marginH},${marginH},${marginV},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const events: string[] = [];
  for (const block of fs.readFileSync(srtPath, 'utf-8').replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.trim().split('\n');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split('-->').map((x) => x.trim());
    const text = lines.slice(timing + 1).join('\\N').replace(/[{}]/g, '').trim();
    if (text) events.push(`Dialogue: 0,${srtTimeToAss(a)},${srtTimeToAss(b)},Default,,0,0,0,,${text}`);
  }
  fs.writeFileSync(assPath, [...header, ...events, ''].join('\n'), 'utf-8');
  return assPath;
}

/** Grab one frame as a JPEG poster for the library. */
export function extractThumbnail(videoPath: string, outputPath: string, atSecond = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .inputOptions(['-ss', String(atSecond)])
      .outputOptions(['-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// ─── SRT helpers ──────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  const s  = Math.floor((ms % 60_000) / 1000);
  const cs = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(cs).padStart(3, '0')}`;
}

// Group words into subtitle lines of ~5 words each
function buildSRT(words: string[], totalDuration: number): string {
  const WORDS_PER_LINE = 5;
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    groups.push(words.slice(i, i + WORDS_PER_LINE));
  }

  const groupDuration = (totalDuration * 1000) / groups.length;
  return groups.map((group, i) => {
    const startMs = Math.round(i * groupDuration);
    const endMs   = Math.round((i + 1) * groupDuration);
    return `${i + 1}\n${fmtMs(startMs)} --> ${fmtMs(endMs)}\n${group.join(' ')}\n`;
  }).join('\n');
}

export function generateSRT(scriptText: string, outputPath: string, totalDuration: number): string {
  const words   = scriptText.replace(/\s+/g, ' ').trim().split(' ');
  const content = buildSRT(words, totalDuration);
  fs.writeFileSync(outputPath, content, 'utf-8');
  return outputPath;
}

// ─── Stock clip picker ────────────────────────────────────────────────────────

function pickClips(dir: string, targetDuration: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const exts = ['.mp4', '.mov', '.webm', '.mkv'];
  const files = fs.readdirSync(dir)
    .filter((f) => exts.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))
    .sort(() => Math.random() - 0.5);

  const selected: string[] = [];
  let acc = 0;
  for (const clip of files) {
    selected.push(clip);
    acc += 5;
    if (acc >= targetDuration) break;
  }
  return selected;
}

// ─── Main render ──────────────────────────────────────────────────────────────

/**
 * Draw a branded gradient still (half resolution, upscaled by the render) for videos without any
 * visuals. fluent-ffmpeg cannot parse ffmpeg 7's format list and rejects "-f lavfi" inputs, so
 * this runs ffmpeg directly, asynchronously.
 */
async function gradientBackground(outputPath: string, width: number, height: number): Promise<string> {
  const bg = outputPath.replace(/\.mp4$/, '') + '.bg.png';
  const w = Math.round(width / 2), h = Math.round(height / 2);
  await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
    `gradients=s=${w}x${h}:c0=0x6d28d9:c1=0x0b0b16:x0=0:y0=0:x1=${w}:y1=${h}:nb_colors=2:d=1`,
    '-vf', 'vignette=angle=PI/5', '-frames:v', '1', bg], { timeout: 120_000 });
  return bg;
}

export async function renderVideo(opts: RenderOptions): Promise<string> {
  const hasVisuals = (opts.clipPaths?.length ?? 0) > 0 || (opts.imagePaths?.length ?? 0) > 0
    || pickClips(opts.stockClipsDir ?? '', 5).length > 0;
  if (hasVisuals) return renderVideoInner(opts);
  const [w, h] = (opts.resolution ?? '1080x1920').split('x').map(Number);
  const bg = await gradientBackground(opts.outputPath, w, h);
  return renderVideoInner({ ...opts, imagePaths: [bg] });
}

function renderVideoInner(opts: RenderOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const {
      voiceoverPath,
      musicPath,
      stockClipsDir,
      imagePaths  = [],
      clipPaths   = [],
      outputPath,
      subtitleText,
      srtPath: providedSrtPath,
      duration    = 60,
      musicVolume = 0.2,
      resolution  = '1080x1920',
      captionStyle = 'box',
      watermark,
    } = opts;

    const [width, height] = resolution.split('x').map(Number);

    // Choose SRT path: provided > derived from voice path
    const srtPath = providedSrtPath ?? voiceoverPath.replace(/\.\w+$/, '.srt');

    // Build SRT from text if not already present
    if (!providedSrtPath && subtitleText && !fs.existsSync(srtPath)) {
      generateSRT(subtitleText, srtPath, duration);
    }
    const hasSrt = captionStyle !== 'none' && fs.existsSync(srtPath);

    // Priority: user clips > user images > stock clips dir > generated gradient background
    let clips: string[] = [];
    let useImages = false;
    if (clipPaths.length > 0) {
      clips = clipPaths;
    } else if (imagePaths.length > 0) {
      clips = imagePaths;
      useImages = true;
    } else {
      clips = pickClips(stockClipsDir ?? '', duration);
    }
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    const durationPerImage = useImages && clips.length > 0 ? duration / clips.length : duration;

    let cmd = ffmpeg();

    // ── Video inputs ─────────────────────────────────────────────────────────
    if (clips.length > 0) {
      clips.forEach((c) => {
        if (useImages) {
          cmd.input(c).inputOptions(['-loop', '1', '-t', String(durationPerImage)]);
        } else {
          cmd.input(c);
        }
      });
    } else {
      // Fallback: deep purple/dark background (much better than plain black)
      cmd
        .input(`color=c=0x0D0B1E:s=${width}x${height}:r=30:d=${duration}`)
        .inputOptions(['-f', 'lavfi']);
    }

    // ── Audio inputs ─────────────────────────────────────────────────────────
    const voiceInputIdx = clips.length > 0 ? clips.length : 1; // index of voice stream
    cmd.input(voiceoverPath);

    const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));
    if (hasMusic) cmd.input(musicPath!);

    // ── Complex filter chain ──────────────────────────────────────────────────
    const videoFilters: (ffmpeg.FilterSpecification | string)[] = [];
    let lastVLabel: string;

    if (clips.length > 0) {
      // Scale each clip/image to fill target size (cover behaviour = increase + crop)
      clips.forEach((_, i) => {
        videoFilters.push({
          filter: 'scale',
          options: `${width}:${height}:force_original_aspect_ratio=increase`,
          inputs:  `[${i}:v]`,
          outputs: `[vs${i}]`,
        });
      });
      // Crop exact resolution after scale (handles non-exact ratios)
      clips.forEach((_, i) => {
        videoFilters.push({
          filter: 'crop',
          options: `${width}:${height}`,
          inputs:  `[vs${i}]`,
          outputs: `[vc${i}]`,
        });
      });
      // Concat
      videoFilters.push({
        filter: 'concat',
        options: { n: clips.length, v: 1, a: 0 },
        inputs:  clips.map((_, i) => `[vc${i}]`).join(''),
        outputs: '[vcat]',
      });
      lastVLabel = '[vcat]';
    } else {
      // Dark background: apply vignette to darken edges (forward = default)
      videoFilters.push({
        filter: 'vignette',
        options: 'angle=PI/4',
        inputs:  '[0:v]',
        outputs: '[vbg]',
      });
      lastVLabel = '[vbg]';
    }

    // Subtitle overlay (SRT converted to a pixel-exact ASS file for the chosen style)
    if (hasSrt) {
      const assPath = outputPath.replace(/\.mp4$/, '') + '.ass';
      srtToAss(srtPath, assPath, captionStyle, width, height);
      const escaped = assPath.replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');
      videoFilters.push({
        filter: `subtitles='${escaped}'`,
        inputs:  lastVLabel,
        outputs: '[vout]',
      });
      lastVLabel = '[vout]';
    }

    // Brand watermark (text read from a file: no escaping of user input in the filter graph)
    const wm = (watermark ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
    if (wm && fs.existsSync(WATERMARK_FONT)) {
      const wmFile = outputPath.replace(/\.mp4$/, '') + '.wm.txt';
      fs.writeFileSync(wmFile, wm, 'utf-8');
      videoFilters.push({
        filter: 'drawtext',
        options: {
          fontfile: WATERMARK_FONT, textfile: wmFile, fontcolor: 'white@0.85',
          fontsize: Math.round(Math.min(width, height) * 0.035),
          x: 'w-tw-36', y: '36', box: 1, boxcolor: 'black@0.35', boxborderw: 12,
        },
        inputs: lastVLabel,
        outputs: '[vwm]',
      });
      lastVLabel = '[vwm]';
    }

    // Audio mix
    const allFilters: (ffmpeg.FilterSpecification | string)[] = [...videoFilters];
    let audioMapArg: string;

    if (hasMusic) {
      const musicIdx = voiceInputIdx + 1;
      allFilters.push(
        `[${voiceInputIdx}:a]volume=1.0[voice]`,
        `[${musicIdx}:a]volume=${musicVolume}[music]`,
        '[voice][music]amix=inputs=2:duration=first:dropout_transition=3[aout]'
      );
      audioMapArg = '[aout]';
    } else {
      audioMapArg = `${voiceInputIdx}:a`;
    }

    const videoMapArg = videoFilters.length > 0 ? lastVLabel : '0:v';

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

    if (allFilters.length > 0) {
      cmd.complexFilter(allFilters as ffmpeg.FilterSpecification[]);
    }

    cmd
      .outputOptions(outputOptions)
      .output(outputPath)
      .on('start', (cmdLine: string) => console.log('[FFmpeg] start:', cmdLine.slice(0, 200)))
      .on('progress', (p: { percent?: number }) =>
        console.log(`[FFmpeg] ${Math.round(p.percent ?? 0)}%`)
      )
      .on('end', () => resolve(outputPath))
      .on('error', (err, _stdout, stderr) => {
        console.error('[FFmpeg] error:', err.message);
        console.error('[FFmpeg] stderr:', stderr?.slice(-2000));
        reject(err);
      })
      .run();
  });
}

// ─── Mix music into an existing video (video stream copied, audio re-encoded) ──

export function addMusicToVideo(opts: {
  videoPath: string;
  musicPath: string;
  outputPath: string;
  musicVolume?: number;
}): Promise<string> {
  const { videoPath, musicPath, outputPath, musicVolume = 0.15 } = opts;
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(musicPath)
      .complexFilter([
        `[1:a]volume=${musicVolume}[music]`,
        '[0:a][music]amix=inputs=2:duration=first:dropout_transition=3[aout]',
      ])
      .outputOptions([
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',   // no video re-encode — fast
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmd: string) => console.log('[FFmpeg addMusic] start:', cmd.slice(0, 120)))
      .on('end',   () => resolve(outputPath))
      .on('error', (err) => {
        console.error('[FFmpeg addMusic] error:', err.message);
        reject(err);
      })
      .run();
  });
}
