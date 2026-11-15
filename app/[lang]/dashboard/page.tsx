'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

type Lang       = 'fr' | 'en';
type Step       = 'script' | 'audio' | 'video' | 'publish';
type JobStatus  = 'idle' | 'loading' | 'processing' | 'done' | 'error';
type Mode       = 'ai' | 'manual' | 'narration';
type Resolution = '1080x1920' | '1920x1080' | '1080x1080';
type CaptionStyle = 'box' | 'bold' | 'minimal' | 'neon' | 'none';

const SCRIPT_LANGS = [
  { id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' }, { id: 'sw', label: 'Kiswahili' }, { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' }, { id: 'ar', label: 'العربية' },
];

const CAPTION_OPTS: { id: CaptionStyle; fr: string; en: string; cls: string }[] = [
  { id: 'box',     fr: 'Encadré',  en: 'Boxed',   cls: 'bg-black/70 text-white px-1.5 rounded' },
  { id: 'bold',    fr: 'Viral',    en: 'Viral',   cls: 'text-yellow-300 font-black [text-shadow:0_2px_0_#000,0_0_6px_#000]' },
  { id: 'minimal', fr: 'Minimal',  en: 'Minimal', cls: 'text-white/90 font-normal [text-shadow:0_1px_2px_#000]' },
  { id: 'neon',    fr: 'Néon',     en: 'Neon',    cls: 'text-fuchsia-300 font-bold [text-shadow:0_0_4px_#22d3ee,0_0_10px_#22d3ee]' },
  { id: 'none',    fr: 'Aucun',    en: 'None',    cls: 'text-slate-500 line-through' },
];

interface Template { id: string; icon: string; fr: string; en: string; topicFr: string; topicEn: string; duration: number; mood: string; bpm: number; resolution: Resolution }
const TEMPLATES: Template[] = [
  { id: 'facts', icon: '🤯', fr: 'Faits étonnants', en: 'Mind-blowing facts', topicFr: '5 faits étonnants que personne ne connaît sur ', topicEn: '5 mind-blowing facts nobody knows about ', duration: 45, mood: 'energetic', bpm: 125, resolution: '1080x1920' },
  { id: 'motivation', icon: '🔥', fr: 'Motivation', en: 'Motivation', topicFr: 'Discours de motivation pour ne jamais abandonner ', topicEn: 'Motivational speech to never give up ', duration: 60, mood: 'epic', bpm: 100, resolution: '1080x1920' },
  { id: 'business', icon: '💼', fr: 'Astuce business', en: 'Business tip', topicFr: '3 erreurs qui tuent une petite entreprise ', topicEn: '3 mistakes that kill a small business ', duration: 60, mood: 'corporate', bpm: 110, resolution: '1080x1920' },
  { id: 'story', icon: '📜', fr: 'Histoire vraie', en: 'True story', topicFr: "L'histoire incroyable de ", topicEn: 'The incredible true story of ', duration: 90, mood: 'cinematic', bpm: 90, resolution: '1080x1920' },
  { id: 'faith', icon: '🙏', fr: 'Foi & inspiration', en: 'Faith & inspiration', topicFr: 'Méditation du jour sur ', topicEn: 'Daily devotional about ', duration: 60, mood: 'calm', bpm: 80, resolution: '1080x1920' },
  { id: 'tech', icon: '🤖', fr: 'Tech & IA', en: 'Tech & AI', topicFr: "L'outil IA qui va changer ", topicEn: 'The AI tool that will change ', duration: 45, mood: 'energetic', bpm: 128, resolution: '1080x1920' },
  { id: 'health', icon: '🥗', fr: 'Santé & bien-être', en: 'Health & wellness', topicFr: '3 habitudes simples pour ', topicEn: '3 simple habits to ', duration: 45, mood: 'happy', bpm: 115, resolution: '1080x1920' },
  { id: 'youtube', icon: '🎞️', fr: 'Vidéo YouTube', en: 'YouTube video', topicFr: 'Tout comprendre en 2 minutes : ', topicEn: 'Understand it all in 2 minutes: ', duration: 120, mood: 'lofi', bpm: 85, resolution: '1920x1080' },
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Poll a project until its background render is finished. */
async function waitForProject(jobId: string, timeoutMs = 90 * 60_000): Promise<{ outputFile: string; duration: number | null }> {
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const res = await fetch(`/api/projects/${jobId}`);
      if (res.ok) {
        const { project } = await res.json();
        if (project.status === 'ready' && project.outputFile) return project;
        if (project.status === 'failed') throw new Error(project.error || 'Render failed');
      }
    } catch (e) {
      if (e instanceof Error && e.message !== 'Failed to fetch') throw e;
    }
    if (Date.now() - started > timeoutMs) throw new Error('Render timeout');
  }
}

/** Throw the API's error (quota errors keep their code so the UI can offer an upgrade). */
async function apiJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.code ?? json.error ?? `HTTP ${res.status}`);
  return json;
}

function ErrorBox({ msg, lang }: { msg: string; lang: Lang }) {
  if (!msg) return null;
  if (msg.includes('quota_exceeded')) {
    return (
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex flex-wrap items-center gap-3">
        <span>⚡ {lang === 'fr' ? 'Quota mensuel atteint.' : 'Monthly quota reached.'}</span>
        <a href={`/${lang}/dashboard/account`} className="ml-auto px-3 py-1.5 rounded-lg bg-amber-400 text-black font-semibold text-xs">
          {lang === 'fr' ? 'Passer au plan supérieur' : 'Upgrade plan'}
        </a>
      </div>
    );
  }
  return <div className="p-4 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-sm">{msg}</div>;
}

function CaptionStylePicker({ value, onChange, lang }: { value: CaptionStyle; onChange: (v: CaptionStyle) => void; lang: Lang }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{lang === 'fr' ? 'Style des sous-titres' : 'Caption style'}</label>
      <div className="grid grid-cols-5 gap-2">
        {CAPTION_OPTS.map((c) => (
          <button key={c.id} type="button" onClick={() => onChange(c.id)}
            className={`rounded-xl border py-2 px-1 flex flex-col items-center gap-1.5 transition-all ${
              value === c.id ? 'border-violet-500 bg-violet-500/15' : 'border-[#2A2A45] hover:border-slate-500'}`}>
            <span className="h-9 w-full rounded-md bg-gradient-to-br from-slate-700 to-slate-900 flex items-end justify-center pb-1">
              <span className={`text-[10px] leading-none ${c.cls}`}>Aa</span>
            </span>
            <span className={`text-[11px] ${value === c.id ? 'text-violet-300' : 'text-slate-400'}`}>{lang === 'fr' ? c.fr : c.en}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface ElevenLabsVoice {
  id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview?: string | null;
}

interface GeneratedData {
  jobId?: string;
  title?: string;
  script?: string;
  hashtags?: string[];
  voicePath?: string;
  musicPath?: string;
  imagePaths?: string[];
  clipPaths?: string[];
  outputPath?: string;
  voiceReady?: boolean;
  duration?: number;
}

const PLATFORM_OPTS = [
  { id: 'youtube',   label: 'YouTube Shorts', icon: '▶' },
  { id: 'tiktok',    label: 'TikTok',         icon: '♪' },
  { id: 'instagram', label: 'Instagram Reels', icon: '◉' },
  { id: 'facebook',  label: 'Facebook',        icon: 'f' },
  { id: 'twitter',   label: 'X / Twitter',     icon: '✕' },
] as const;

const MOOD_OPTS = ['energetic','calm','dramatic','happy','corporate','epic','cinematic','lofi'] as const;

const FORMAT_OPTS: { id: Resolution; label: string; sub: string; icon: string }[] = [
  { id: '1080x1920', label: 'Portrait', sub: '9:16',  icon: '📱' },
  { id: '1920x1080', label: 'Paysage',  sub: '16:9',  icon: '🖥' },
  { id: '1080x1080', label: 'Carré',    sub: '1:1',   icon: '⬛' },
];

const UI: Record<Lang, Record<string, string>> = {
  fr: {
    title:             'Studio IA',
    topic_label:       'Sujet / Niche',
    topic_ph:          'ex: Crypto, Fitness, Humour, Business...',
    trending_btn:      '🔥 Sujets tendance',
    trending_title:    'Tendances du marché',
    trending_market:   'Marché',
    trending_loading:  'Chargement des tendances...',
    trending_ai_pending: 'L\'IA prépare des idées de sujets adaptées (peut prendre plusieurs minutes sur ce serveur)...',
    trending_empty:    'Aucune suggestion pour le moment. Réessayez avec une autre niche.',
    trending_error:    'Impossible de charger les tendances',
    trending_use:      'Utiliser',
    trending_why:      'Pourquoi ça tend',
    lang_label:        'Langue du script',
    dur_label:         'Durée (secondes)',
    mood_label:        'Ambiance musicale',
    bpm_label:         'BPM',
    format_label:      'Format vidéo',
    platforms:         'Plateformes de publication',
    voice_label:       'Voix ElevenLabs',
    voice_custom_ph:   'Votre Voice ID cloné (ex: abc123...)',
    voice_loading:     'Chargement des voix...',
    voice_custom:      '+ Voix personnalisée (Voice ID)',
    gen_script:        'Générer le script & la voix',
    gen_video:         'Monter la vidéo',
    publish:           'Publier partout',
    publishing:        'Publication en cours...',
    rendering:         'Montage en cours...',
    generating:        'Génération IA en cours...',
    uploading:         'Upload en cours...',
    step_script:       '1. Script & Audio',
    step_video:        '2. Montage Vidéo',
    step_pub:          '3. Publication',
    script_out:        'Script généré',
    hashtags:          'Hashtags',
    voice_ready:       'Voix-off prête',
    voice_pending:     'Génération voix en cours… (10-30 min sur CPU)',
    music_ready:       'Musique prête',
    video_ready:       'Vidéo prête',
    render_when_ready: 'Monter la vidéo (voix en cours...)',
    mode_ai:           'Mode IA',
    mode_manual:       'Mode Manuel',
    mode_narration:    'Narration',
    manual_title:      'Titre de la vidéo',
    manual_title_ph:   'Ex: Matthieu chapitre 1 — Lecture de la Bible',
    manual_script:     'Votre texte (sous-titres)',
    manual_script_ph:  'Collez ici votre script ou vos versets...',
    manual_voice:      'Votre voix-off (WAV ou MP3)',
    manual_images:     'Vos images (JPG/PNG — plusieurs possibles)',
    manual_clips:      'Vos clips vidéo (MP4)',
    manual_music:      'Ajouter une musique de fond (optionnel)',
    manual_render:     'Monter ma vidéo',
    files_selected:    'fichier(s) sélectionné(s)',
    upload_render:     'Upload & Montage en cours...',
    narr_title:        'Titre (optionnel)',
    narr_title_ph:     'Ex: Matthieu 1 — Généalogie de Jésus-Christ',
    narr_text:         'Texte à lire (Bible, roman, cours...)',
    narr_text_ph:      'Collez ici votre texte complet — chapitres entiers, versets, scripts longs...\n\nL\'IA va générer la voix et monter automatiquement la vidéo à la durée exacte du texte.',
    narr_images:       'Images de fond (optionnel)',
    narr_voice:        'Voix ElevenLabs',
    narr_render:       'Générer la vidéo narration',
    narr_rendering:    'Génération en cours... (peut prendre quelques minutes)',
    narr_processing:   'Audio XTTS en cours de génération en arrière-plan...',
    narr_processing_hint: 'La synthèse vocale CPU peut prendre 30–90 min selon la longueur. Cette page se met à jour automatiquement.',
    narr_chars:        'caractères',
    narr_chunks:       'segment(s) audio',
    narr_how1:         'Collez n\'importe quel texte long — chapitre de Bible, roman, cours...',
    narr_how2:         'ElevenLabs lit le texte en entier (découpé si nécessaire)',
    narr_how3:         'La vidéo dure exactement le temps de la lecture',
    narr_how4:         'Ajoutez des images de fond en option',
    narr_how5:         'Format portrait (Shorts), paysage (YouTube) ou carré',
    narr_gen_images:   'Générer des images IA (Stability AI)',
    narr_gen_images_on:'Images IA : ACTIVÉ',
    narr_style:        'Style des images',
    narr_style_ph:     'ex: illustration biblique, aquarelle, photoréaliste...',
    ai_gen_images:     '🎨 Générer des images depuis le script',
    ai_gen_images_ok:  'image(s) générée(s)',
    ai_gen_images_loading: 'Génération images...',
    narr_music:        '🎵 Musique de fond',
    narr_music_gen:    'Générer une musique instrumentale (MusicGen)',
    narr_music_upload: 'Ou importer un fichier audio (MP3/WAV)',
    narr_music_mood:   'Ambiance',
    narr_music_bpm:    'BPM',
    narr_music_vol:    'Volume musique',
  },
  en: {
    title:             'AI Studio',
    topic_label:       'Topic / Niche',
    topic_ph:          'e.g. Crypto, Fitness, Comedy, Business...',
    trending_btn:      '🔥 Trending topics',
    trending_title:    'Market trends',
    trending_market:   'Market',
    trending_loading:  'Loading trends...',
    trending_ai_pending: 'AI is preparing tailored topic ideas (can take several minutes on this server)...',
    trending_empty:    'No suggestions yet. Try a different niche.',
    trending_error:    'Could not load trends',
    trending_use:      'Use',
    trending_why:      'Why it trends',
    lang_label:        'Script language',
    dur_label:         'Duration (seconds)',
    mood_label:        'Music mood',
    bpm_label:         'BPM',
    format_label:      'Video format',
    platforms:         'Publish to platforms',
    voice_label:       'ElevenLabs Voice',
    voice_custom_ph:   'Your cloned Voice ID (e.g. abc123...)',
    voice_loading:     'Loading voices...',
    voice_custom:      '+ Custom voice (Voice ID)',
    gen_script:        'Generate script & voice',
    gen_video:         'Render video',
    publish:           'Publish everywhere',
    publishing:        'Publishing...',
    rendering:         'Rendering...',
    generating:        'AI generating...',
    uploading:         'Uploading...',
    step_script:       '1. Script & Audio',
    step_video:        '2. Video Render',
    step_pub:          '3. Publish',
    script_out:        'Generated script',
    hashtags:          'Hashtags',
    voice_ready:       'Voiceover ready',
    voice_pending:     'Generating voice… (10-30 min on CPU)',
    music_ready:       'Music ready',
    video_ready:       'Video ready',
    render_when_ready: 'Render video (voice pending...)',
    mode_ai:           'AI Mode',
    mode_manual:       'Manual Mode',
    mode_narration:    'Narration',
    manual_title:      'Video title',
    manual_title_ph:   'E.g. Matthew Chapter 1 — Bible Reading',
    manual_script:     'Your text (subtitles)',
    manual_script_ph:  'Paste your script or verses here...',
    manual_voice:      'Your voiceover (WAV or MP3)',
    manual_images:     'Your images (JPG/PNG — multiple allowed)',
    manual_clips:      'Your video clips (MP4)',
    manual_music:      'Add background music (optional)',
    manual_render:     'Render my video',
    files_selected:    'file(s) selected',
    upload_render:     'Uploading & Rendering...',
    narr_title:        'Title (optional)',
    narr_title_ph:     'E.g. Matthew 1 — The Genealogy of Jesus Christ',
    narr_text:         'Text to read (Bible, novel, course...)',
    narr_text_ph:      'Paste your full text here — whole chapters, verses, long scripts...\n\nAI will generate the voice and automatically render the video to the exact duration of the text.',
    narr_images:       'Background images (optional)',
    narr_voice:        'ElevenLabs Voice',
    narr_render:       'Generate narration video',
    narr_rendering:    'Generating... (may take a few minutes)',
    narr_processing:   'XTTS audio generation running in background...',
    narr_processing_hint: 'CPU voice synthesis may take 30–90 min depending on length. This page updates automatically.',
    narr_chars:        'characters',
    narr_chunks:       'audio segment(s)',
    narr_how1:         'Paste any long text — Bible chapter, novel, course...',
    narr_how2:         'ElevenLabs reads the full text (chunked if needed)',
    narr_how3:         'Video duration exactly matches the reading time',
    narr_how4:         'Optionally add background images',
    narr_how5:         'Portrait (Shorts), landscape (YouTube), or square format',
    narr_gen_images:   'Generate AI images (Stability AI)',
    narr_gen_images_on:'AI images: ON',
    narr_style:        'Image style',
    narr_style_ph:     'e.g. biblical illustration, watercolor, photorealistic...',
    ai_gen_images:     '🎨 Generate images from script',
    ai_gen_images_ok:  'images generated',
    ai_gen_images_loading: 'Generating images...',
    narr_music:        '🎵 Background music',
    narr_music_gen:    'Generate instrumental music (MusicGen)',
    narr_music_upload: 'Or upload an audio file (MP3/WAV)',
    narr_music_mood:   'Mood',
    narr_music_bpm:    'BPM',
    narr_music_vol:    'Music volume',
  },
};

function aspectRatio(res: Resolution) {
  if (res === '1920x1080') return '16/9';
  if (res === '1080x1080') return '1/1';
  return '9/16';
}

/** Spelling/grammar correction through /api/ai/proofread; returns the original text on failure. */
async function proofreadApi(text: string, lang: string): Promise<{ text: string; changes: number } | null> {
  if (!text.trim() || text.length > 60_000) return null;
  try {
    const res = await fetch('/api/ai/proofread', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function ProofreadBar({ text, setText, lang, uiLang, auto, setAuto }: {
  text: string; setText: (t: string) => void; lang: string; uiLang: Lang; auto: boolean; setAuto: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fr = uiLang === 'fr';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-xs">
      <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-violet-500" />
        {fr ? 'Correction automatique des fautes' : 'Automatic spelling correction'}
      </label>
      <button type="button" disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true); setMsg('');
          const r = await proofreadApi(text, lang);
          setBusy(false);
          if (!r) { setMsg(text.length > 60_000 ? (fr ? 'Texte trop long pour la correction (60 000 caractères max).' : 'Text too long to correct (60,000 characters max).') : (fr ? 'Correction indisponible, réessayez.' : 'Correction unavailable, retry.')); return; }
          setText(r.text);
          setMsg(r.changes ? (fr ? `✓ ${r.changes} correction(s) appliquée(s)` : `✓ ${r.changes} fix(es) applied`) : (fr ? '✓ Aucune faute trouvée' : '✓ No mistakes found'));
        }}
        className="text-violet-400 hover:text-violet-300 disabled:opacity-40">
        {busy ? (fr ? 'Correction…' : 'Correcting…') : (fr ? '✓ Corriger maintenant' : '✓ Correct now')}
      </button>
      {msg && <span className="text-slate-400">{msg}</span>}
    </div>
  );
}

function FormatSelector({ value, onChange, label }: { value: Resolution; onChange: (v: Resolution) => void; label: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <div className="flex gap-2">
        {FORMAT_OPTS.map((f) => (
          <button key={f.id} onClick={() => onChange(f.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs transition-all ${
              value === f.id
                ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                : 'border-[#2A2A45] text-slate-500 hover:border-slate-500 hover:text-slate-300'
            }`}>
            <span className="text-base">{f.icon}</span>
            <span className="font-medium">{f.label}</span>
            <span className="opacity-60 text-[10px]">{f.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const MARKET_OPTS = [
  { id: 'US', label: '🇺🇸 US' },
  { id: 'FR', label: '🇫🇷 France' },
  { id: 'GB', label: '🇬🇧 UK' },
  { id: 'CD', label: '🇨🇩 RD Congo' },
  { id: 'BE', label: '🇧🇪 Belgique' },
  { id: 'CA', label: '🇨🇦 Canada' },
] as const;

interface TrendSuggestion {
  topic: string;
  hook: string;
  whyTrending: string;
}

function TrendingTopics({
  niche, lang, onPick, u,
}: {
  niche: string;
  lang: Lang;
  onPick: (topic: string) => void;
  u: Record<string, string>;
}) {
  const [open, setOpen]               = useState(false);
  const [market, setMarket]           = useState<string>('US');
  const [loading, setLoading]         = useState(false);
  const [aiPending, setAiPending]     = useState(false);
  const [error, setError]             = useState(false);
  const [suggestions, setSuggestions] = useState<TrendSuggestion[] | null>(null);
  const [rawTrends, setRawTrends]     = useState<{ title: string }[] | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const fetchTrends = useCallback(async () => {
    setLoading(true);
    setError(false);
    setSuggestions(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    try {
      const res = await fetch('/api/media/trending-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: niche.trim() || 'general', market, lang }),
      });
      if (!res.ok) throw new Error('request failed');
      const { data } = await res.json();
      setRawTrends(data.trends ?? []);
      setLoading(false);
      setAiPending(true);

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/media/trending-topics-status/${data.jobId}`);
          const status = await statusRes.json();
          if (!status.ready) return;
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setAiPending(false);
          if (status.error) { setError(true); setSuggestions([]); }
          else setSuggestions(status.suggestions ?? []);
        } catch { /* keep polling */ }
      }, 5_000);
    } catch {
      setError(true);
      setSuggestions([]);
      setLoading(false);
      setAiPending(false);
    }
  }, [niche, market, lang]);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && suggestions === null) fetchTrends();
        }}
        className="text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
      >
        {u.trending_btn}
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-xl border border-[#2A2A45] bg-[#16162A] space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{u.trending_market}</span>
            <select
              value={market}
              onChange={(e) => { setMarket(e.target.value); setSuggestions(null); }}
              className="bg-[#0F0F1A] border border-[#2A2A45] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500"
            >
              {MARKET_OPTS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <button
              type="button"
              onClick={fetchTrends}
              disabled={loading}
              className="ml-auto text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50"
            >
              ↻
            </button>
          </div>

          {loading && <p className="text-xs text-slate-500">{u.trending_loading}</p>}

          {!loading && rawTrends && rawTrends.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rawTrends.slice(0, 8).map((t, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
                  {t.title}
                </span>
              ))}
            </div>
          )}

          {!loading && error && <p className="text-xs text-red-400">{u.trending_error}</p>}
          {!loading && aiPending && (
            <p className="text-xs text-slate-500 animate-pulse">{u.trending_ai_pending}</p>
          )}
          {!loading && !aiPending && !error && suggestions?.length === 0 && (
            <p className="text-xs text-slate-500">{u.trending_empty}</p>
          )}

          {!loading && suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-[#0F0F1A] p-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{s.topic}</p>
                    <p className="text-xs text-slate-500 truncate">{u.trending_why}: {s.whyTrending}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { onPick(s.topic); setOpen(false); }}
                    className="shrink-0 text-xs px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
                  >
                    {u.trending_use}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VoiceSelector({
  voices, voicesLoading, voiceId, onChange, customVoiceId, onCustomChange,
  useCustom, onUseCustom, u,
}: {
  voices: ElevenLabsVoice[];
  voicesLoading: boolean;
  voiceId: string;
  onChange: (id: string) => void;
  customVoiceId: string;
  onCustomChange: (id: string) => void;
  useCustom: boolean;
  onUseCustom: (v: boolean) => void;
  u: Record<string, string>;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">🎙️ {u.voice_label}</label>
      {voicesLoading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
          <span className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          {u.voice_loading}
        </div>
      ) : (
        <div className="space-y-2">
          <select value={voiceId} onChange={(e) => { onChange(e.target.value); onUseCustom(false); }}
            className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500 text-sm">
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.category === 'cloned' ? '🎤 ' : ''}{v.name}
                {v.labels?.gender ? ` — ${v.labels.gender}` : ''}
                {v.category === 'cloned' ? ' (cloned)' : ''}
              </option>
            ))}
          </select>
          <button onClick={() => onUseCustom(!useCustom)}
            className={`text-xs transition-colors ${useCustom ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'}`}>
            {u.voice_custom}
          </button>
          {useCustom && (
            <input value={customVoiceId} onChange={(e) => onCustomChange(e.target.value)}
              placeholder={u.voice_custom_ph}
              className="w-full bg-[#16162A] border border-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 text-sm" />
          )}
        </div>
      )}
    </div>
  );
}

function VideoPlayer({ outputPath, label, lang, resolution = '1080x1920' }: {
  outputPath: string; label: string; lang: string; resolution?: Resolution;
}) {
  const filename  = outputPath.split('/').pop() ?? '';
  const streamUrl = `/api/media/stream/${filename}`;
  const ratio     = aspectRatio(resolution);
  const maxH      = resolution === '1920x1080' ? '320px' : '520px';
  return (
    <div className="glow-card rounded-2xl overflow-hidden border border-green-700/50">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm font-bold">✓</span>
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/${lang}/dashboard/library`}
            className="px-3 py-1.5 rounded-lg border border-[#2A2A45] text-slate-300 hover:border-violet-500 text-xs transition-colors">
            {lang === 'fr' ? 'Bibliothèque' : 'Library'}
          </a>
          <a href={`${streamUrl}?download=1`} download={filename}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors">
            ⬇ {lang === 'fr' ? 'Télécharger' : 'Download'}
          </a>
        </div>
      </div>
      <video src={streamUrl} controls playsInline className="w-full bg-black"
        style={{ aspectRatio: ratio, maxHeight: maxH }}>
        <source src={streamUrl} type="video/mp4" />
      </video>
      <div className="px-4 py-2 text-xs text-slate-600">{filename}</div>
    </div>
  );
}

export default function DashboardPage() {
  const params  = useParams();
  const rawLang = Array.isArray(params?.lang) ? params.lang[0] : (params?.lang ?? 'fr');
  const lang    = (rawLang === 'en' ? 'en' : 'fr') as Lang;
  const u       = UI[lang];


  // ── Mode toggle ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>('ai');

  // ── ElevenLabs voices (shared) ───────────────────────────────────────────────
  const [elVoices,      setElVoices]      = useState<ElevenLabsVoice[]>([]);
  const [elVoiceId,     setElVoiceId]     = useState('TX3LPaxmHKxFdv7VOQHJ');
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [useCustomVoice, setUseCustomVoice] = useState(false);
  const [voicesLoading,  setVoicesLoading]  = useState(false);

  useEffect(() => {
    setVoicesLoading(true);
    fetch('/api/voices')
      .then((r) => r.json())
      .then((j) => setElVoices(j.voices ?? []))
      .catch(() => {})
      .finally(() => setVoicesLoading(false));
  }, []);

  const activeVoiceId = useCustomVoice && customVoiceId.trim()
    ? customVoiceId.trim()
    : elVoiceId;

  // ── AI mode state ─────────────────────────────────────────────────────────────
  const [topic,      setTopic]      = useState('');
  const [scriptLang, setScriptLang] = useState<string>(lang);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('box');
  const [autoFix, setAutoFixState] = useState(true);
  const setAutoFix = (v: boolean) => { setAutoFixState(v); try { localStorage.setItem('synthia:autofix', v ? '1' : '0'); } catch { /* ignore */ } };
  useEffect(() => { try { if (localStorage.getItem('synthia:autofix') === '0') setAutoFixState(false); } catch { /* ignore */ } }, []);
  const [templateId, setTemplateId] = useState<string>('');
  const [publishResults, setPublishResults] = useState<{ platform: string; success: boolean; url?: string; error?: string }[] | null>(null);
  const [configuredPlatforms, setConfiguredPlatforms] = useState<Record<string, boolean>>({});
  const [duration,   setDuration]   = useState(60);
  const [mood,       setMood]       = useState<string>('energetic');
  const [bpm,        setBpm]        = useState(120);
  const [platforms,  setPlatforms]  = useState<string[]>(['youtube', 'tiktok']);
  const [resolution, setResolution] = useState<Resolution>('1080x1920');
  const [status,     setStatus]     = useState<JobStatus>('idle');
  const [step,       setStep]       = useState<Step>('script');
  const [data,       setData]       = useState<GeneratedData>({});
  const [errorMsg,   setError]      = useState('');
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI mode: music readiness
  const [musicReady, setMusicReady] = useState(false);

  // ── Manual mode state ─────────────────────────────────────────────────────────
  const [manualTitle,      setManualTitle]      = useState('');
  const [manualScript,     setManualScript]     = useState('');
  const [manualDuration,   setManualDuration]   = useState(60);
  const [manualResolution, setManualResolution] = useState<Resolution>('1080x1920');
  const [manualMood,       setManualMood]       = useState('calm');
  const [addMusic,         setAddMusic]         = useState(false);
  const [voiceFile,        setVoiceFile]        = useState<File | null>(null);
  const [imageFiles,       setImageFiles]       = useState<File[]>([]);
  const [clipFiles,        setClipFiles]        = useState<File[]>([]);
  const [manualStatus,     setManualStatus]     = useState<JobStatus>('idle');
  const [manualData,       setManualData]       = useState<GeneratedData>({});
  const [manualError,      setManualError]      = useState('');
  const [manualStep,       setManualStep]       = useState<'upload' | 'done'>('upload');

  // ── Narration mode state ──────────────────────────────────────────────────────
  const [narrTitle,      setNarrTitle]      = useState('');
  const [narrText,       setNarrText]       = useState('');
  const [narrVoiceId,    setNarrVoiceId]    = useState('TX3LPaxmHKxFdv7VOQHJ');
  const [narrCustomId,   setNarrCustomId]   = useState('');
  const [narrUseCustom,  setNarrUseCustom]  = useState(false);
  const [narrResolution, setNarrResolution] = useState<Resolution>('1080x1920');
  const [narrImageFiles, setNarrImageFiles] = useState<File[]>([]);
  const [narrStatus,     setNarrStatus]     = useState<JobStatus>('idle');
  const [narrData,       setNarrData]       = useState<GeneratedData>({});
  const [narrError,      setNarrError]      = useState('');
  const [narrJobId,       setNarrJobId]       = useState('');
  const [narrMusicReady,  setNarrMusicReady]  = useState(false);
  const [narrMusicMixing, setNarrMusicMixing] = useState(false);
  const narrPollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const narrMusicPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeNarrVoiceId = narrUseCustom && narrCustomId.trim()
    ? narrCustomId.trim()
    : narrVoiceId;

  const estChunks = Math.ceil(narrText.length / 4500);

  // ── AI image generation (shared) ─────────────────────────────────────────────
  const [narrGenImages,   setNarrGenImages]   = useState(false);
  const [narrImageStyle,  setNarrImageStyle]  = useState('');
  const [narrImageCount,  setNarrImageCount]  = useState(4);

  // ── Narration music ───────────────────────────────────────────────────────────
  const [narrAddMusic,    setNarrAddMusic]    = useState(false);
  const [narrMusicMood,   setNarrMusicMood]   = useState('calm');
  const [narrMusicBpm,    setNarrMusicBpm]    = useState(90);
  const [narrMusicVolume, setNarrMusicVolume] = useState(0.15);
  const [narrMusicFile,   setNarrMusicFile]   = useState<File | null>(null);

  // AI mode: standalone image generation from script
  const [aiImages,        setAiImages]        = useState<string[]>([]);
  const [aiImgStatus,     setAiImgStatus]     = useState<JobStatus>('idle');
  const [aiImgError,      setAiImgError]      = useState('');

  // ── Poll voice status (AI mode) ───────────────────────────────────────────────
  useEffect(() => {
    if (!data.jobId || data.voiceReady) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/media/audio-status/${data.jobId}`);
        const json = await res.json();
        if (json.ready) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setData((d) => ({ ...d, voiceReady: true, voicePath: json.voicePath }));
        }
      } catch { /* ignore */ }
    }, 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data.jobId, data.voiceReady]);

  // ── Poll music status (AI mode) ──────────────────────────────────────────────
  useEffect(() => {
    if (!data.jobId || musicReady) return;
    if (musicPollRef.current) clearInterval(musicPollRef.current);
    musicPollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/media/music-status/${data.jobId}`);
        const json = await res.json();
        if (json.ready) {
          clearInterval(musicPollRef.current!);
          musicPollRef.current = null;
          setMusicReady(true);
          setData((d) => ({ ...d, musicPath: json.musicPath }));
        }
      } catch { /* ignore */ }
    }, 20_000);
    return () => { if (musicPollRef.current) clearInterval(musicPollRef.current); };
  }, [data.jobId, musicReady]);

  // ── Poll for music readiness after narration video is done ───────────────────
  useEffect(() => {
    if (narrStatus !== 'done' || !narrJobId || narrMusicReady || !narrAddMusic) return;
    if (narrMusicPollRef.current) clearInterval(narrMusicPollRef.current);
    narrMusicPollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/media/narration-status/${narrJobId}`);
        const json = await res.json();
        if (json.musicReady) {
          clearInterval(narrMusicPollRef.current!);
          narrMusicPollRef.current = null;
          setNarrMusicReady(true);
        }
      } catch { /* network blip */ }
    }, 60_000);
    return () => { if (narrMusicPollRef.current) clearInterval(narrMusicPollRef.current); };
  }, [narrStatus, narrJobId, narrMusicReady, narrAddMusic]);

  // ── Poll narration pipeline status (XTTS async path) ─────────────────────────
  useEffect(() => {
    if (narrStatus !== 'processing' || !narrJobId) return;
    if (narrPollRef.current) clearInterval(narrPollRef.current);
    narrPollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/media/narration-status/${narrJobId}`);
        const json = await res.json();
        if (json.error) {
          clearInterval(narrPollRef.current!);
          narrPollRef.current = null;
          setNarrError(json.error);
          setNarrStatus('error');
        } else if (json.videoReady) {
          clearInterval(narrPollRef.current!);
          narrPollRef.current = null;
          setNarrData({ outputPath: json.outputPath, jobId: narrJobId, duration: json.duration, title: narrTitle });
          if (json.musicReady) setNarrMusicReady(true);
          setNarrStatus('done');
        }
      } catch { /* network blip, keep polling */ }
    }, 30_000);
    return () => { if (narrPollRef.current) clearInterval(narrPollRef.current); };
  }, [narrStatus, narrJobId, narrTitle]);

  // ── Brand kit defaults, platform availability and ?topic= / ?mode= prefill ───
  useEffect(() => {
    fetch('/api/brand').then((r) => (r.ok ? r.json() : null)).then((j) => {
      const b = j?.brand;
      if (!b) return;
      setScriptLang(b.defaultLang);
      setResolution(b.defaultFormat); setManualResolution(b.defaultFormat); setNarrResolution(b.defaultFormat);
      setCaptionStyle(b.captionStyle);
      if (b.defaultVoice) { setElVoiceId(b.defaultVoice); setNarrVoiceId(b.defaultVoice); }
    }).catch(() => {});
    fetch('/api/social/publish').then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.platforms && setConfiguredPlatforms(j.platforms)).catch(() => {});
    const q = new URLSearchParams(window.location.search);
    const t = q.get('topic');
    if (t) setTopic(t.slice(0, 300));
    const m = q.get('mode');
    if (m === 'manual' || m === 'narration') setMode(m);
    if (q.get('from') === 'lab') {
      try {
        const script = sessionStorage.getItem('synthia:script');
        if (script) { setMode('narration'); setNarrText(script); sessionStorage.removeItem('synthia:script'); }
      } catch { /* storage unavailable */ }
    }
  }, []);

  const applyTemplate = (t: Template) => {
    setTemplateId(t.id);
    setTopic(lang === 'fr' ? t.topicFr : t.topicEn);
    setDuration(t.duration); setMood(t.mood); setBpm(t.bpm); setResolution(t.resolution);
  };

  const togglePlatform = (id: string) =>
    setPlatforms((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  // ── AI mode handlers ──────────────────────────────────────────────────────────
  const generateAudio = useCallback(async () => {
    if (!topic.trim()) return;
    setStatus('loading'); setError(''); setMusicReady(false);
    try {
      const res = await fetch('/api/media/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, niche: topic, duration, platform: resolution === '1920x1080' ? 'YouTube' : 'TikTok / Reels / Shorts', lang: scriptLang, mood, bpm, elevenlabsVoiceId: activeVoiceId, resolution }),
      });
      const json = await apiJson(res);
      setData(json.data);
      setPublishResults(null);
      setStep('video');
      setStatus('done');
    } catch (e) { setError(errMsg(e)); setStatus('error'); }
  }, [topic, duration, scriptLang, mood, bpm, activeVoiceId, resolution]);

  const renderVideo = useCallback(async () => {
    if (!data.jobId || !data.voicePath) return;
    setStatus('loading'); setError('');
    try {
      const res = await fetch('/api/media/render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: data.jobId, voicePath: data.voicePath, musicPath: data.musicPath,
          title: data.title, script: data.script, hashtags: data.hashtags,
          imagePaths: aiImages.length > 0 ? aiImages : undefined,
          duration, resolution, captionStyle,
        }),
      });
      await apiJson(res);
      const project = await waitForProject(data.jobId);
      setData((d) => ({ ...d, outputPath: project.outputFile }));
      setStep('publish');
      setStatus('done');
    } catch (e) { setError(errMsg(e)); setStatus('error'); }
  }, [data, duration, resolution, captionStyle, aiImages]);

  const publishAll = useCallback(async () => {
    if (!data.outputPath) return;
    setStatus('loading'); setError('');
    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: data.jobId, platforms }),
      });
      const json = await apiJson(res);
      setPublishResults(json.data ?? []);
      setStatus('done');
    } catch (e) { setError(errMsg(e)); setStatus('error'); }
  }, [data, platforms]);

  // ── AI mode: generate images from script ────────────────────────────────────
  const generateAIImages = useCallback(async () => {
    if (!data.script) return;
    setAiImgStatus('loading'); setAiImgError('');
    try {
      const res = await fetch('/api/media/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: data.script,
          title: data.title,
          resolution,
          count: 4,
          jobId: data.jobId,
        }),
      });
      const json = await apiJson(res);
      setAiImages(json.imagePaths ?? []);
      setData((d) => ({ ...d, imagePaths: json.imagePaths ?? [] }));
      setAiImgStatus('done');
    } catch (e) { setAiImgError(errMsg(e)); setAiImgStatus('error'); }
  }, [data.script, data.title, data.jobId, resolution]);

  // ── Manual mode handler ───────────────────────────────────────────────────────
  const manualRender = useCallback(async () => {
    if (!voiceFile) { setManualError(lang === 'fr' ? 'Voix-off obligatoire' : 'Voiceover is required'); return; }
    setManualStatus('loading'); setManualError('');
    try {
      let script = manualScript;
      if (autoFix && script.trim()) {
        const r = await proofreadApi(script, scriptLang);
        if (r) { script = r.text; setManualScript(r.text); }
      }
      const form = new FormData();
      form.append('mode', 'manual');
      form.append('title', manualTitle);
      form.append('voiceover', voiceFile);
      imageFiles.forEach((f) => form.append('images', f));
      clipFiles.forEach((f)  => form.append('clips', f));

      const upRes  = await fetch('/api/media/upload', { method: 'POST', body: form });
      const upJson = await apiJson(upRes);

      const { jobId, voicePath, imagePaths, clipPaths } = upJson;

      const renderRes = await fetch('/api/media/render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId, voicePath, imagePaths, clipPaths,
          title: manualTitle, script, hashtags: [],
          duration: manualDuration, resolution: manualResolution, captionStyle,
        }),
      });
      await apiJson(renderRes);
      const project = await waitForProject(jobId);

      setManualData({ jobId, voicePath, imagePaths, clipPaths, outputPath: project.outputFile, title: manualTitle, script });
      setManualStep('done');
      setManualStatus('done');
    } catch (e) { setManualError(errMsg(e)); setManualStatus('error'); }
  }, [voiceFile, imageFiles, clipFiles, manualTitle, manualScript, manualDuration, manualResolution, lang, captionStyle, autoFix, scriptLang]);

  // ── Narration mode handler ────────────────────────────────────────────────────
  const narrRender = useCallback(async () => {
    if (!narrText.trim()) return;
    setNarrStatus('loading'); setNarrError(''); setNarrMusicReady(false); setNarrMusicMixing(false);
    try {
      let text = narrText.trim();
      if (autoFix) {
        const r = await proofreadApi(text, scriptLang);
        if (r) { text = r.text.trim(); setNarrText(r.text); }
      }
      // Upload images + music file if any (single FormData call)
      let uploadedImagePaths: string[] = [];
      let uploadedMusicPath: string | undefined;
      let uploadJobId: string | undefined;
      if (narrImageFiles.length > 0 || narrMusicFile) {
        const form = new FormData();
        form.append('mode', 'narration');
        narrImageFiles.forEach((f) => form.append('images', f));
        if (narrMusicFile) form.append('music', narrMusicFile);
        const upRes  = await fetch('/api/media/upload', { method: 'POST', body: form });
        const upJson = await apiJson(upRes);
        uploadJobId = upJson.jobId;
        uploadedImagePaths = upJson.imagePaths ?? [];
        uploadedMusicPath  = upJson.musicPath ?? undefined;
      }

      const res = await fetch('/api/media/generate-narration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId:              uploadJobId,
          lang:               scriptLang,
          text,
          voiceId:            activeNarrVoiceId,
          title:              narrTitle.trim() || null,
          imagePaths:         uploadedImagePaths,
          resolution:         narrResolution,
          generateImages:     narrGenImages && uploadedImagePaths.length === 0,
          imageCount:         narrImageCount,
          imageStyle:         narrImageStyle.trim() || undefined,
          addMusic:           narrAddMusic,
          musicMood:          narrMusicMood,
          musicBpm:           narrMusicBpm,
          musicVolume:        narrMusicVolume,
          uploadedMusicPath,
        }),
      });
      const json = await apiJson(res);

      if (json.data.videoReady === false) {
        setNarrJobId(json.data.jobId);
        setNarrStatus('processing');
      } else {
        setNarrData({ outputPath: json.data.outputPath, jobId: json.data.jobId, duration: json.data.duration, title: narrTitle });
        setNarrStatus('done');
      }
    } catch (e) { setNarrError(errMsg(e)); setNarrStatus('error'); }
  }, [autoFix, scriptLang, narrText, narrTitle, activeNarrVoiceId, narrImageFiles, narrResolution, narrGenImages, narrImageCount, narrImageStyle, narrAddMusic, narrMusicMood, narrMusicBpm, narrMusicVolume, narrMusicFile]);

  const isLoading       = status === 'loading';
  const isManualLoading = manualStatus === 'loading';
  const isNarrLoading   = narrStatus === 'loading' || narrStatus === 'processing';

  return (
    <div className="text-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{u.title}</h1>
          <p className="text-slate-400 text-sm mt-1">{lang === 'fr'
            ? 'Du sujet à la vidéo publiée : script, voix, musique, sous-titres et montage automatiques.'
            : 'From topic to published video: script, voice, music, captions and editing on autopilot.'}</p>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-8 bg-[#16162A] border border-[#2A2A45] rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          <button onClick={() => setMode('ai')}
            className={`shrink-0 px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'ai' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            ✨ {u.mode_ai}
          </button>
          <button onClick={() => setMode('manual')}
            className={`shrink-0 px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'manual' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            🎬 {u.mode_manual}
          </button>
          <button onClick={() => setMode('narration')}
            className={`shrink-0 px-4 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'narration' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            📖 {u.mode_narration}
          </button>
        </div>

        {/* ── AI MODE ─────────────────────────────────────────────────────── */}
        {mode === 'ai' && (
          <>
            {/* Templates */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-200">{lang === 'fr' ? 'Démarrer avec un modèle' : 'Start from a template'}</h2>
                <a href={`/${lang}/dashboard/viral`} className="text-xs text-violet-400 hover:text-violet-300">
                  {lang === 'fr' ? 'Besoin d’idées ? Viral Lab →' : 'Need ideas? Viral Lab →'}
                </a>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" onClick={() => applyTemplate(t)}
                    className={`snap-start shrink-0 w-40 text-left rounded-2xl border p-3 transition-all ${
                      templateId === t.id ? 'border-violet-500 bg-violet-500/15' : 'border-[#2A2A45] bg-[#16162A] hover:border-violet-500/60'}`}>
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-sm font-medium text-white leading-tight">{lang === 'fr' ? t.fr : t.en}</div>
                    <div className="text-[11px] text-slate-500 mt-1">{t.duration}s · {t.resolution === '1920x1080' ? '16:9' : '9:16'} · {t.mood}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Steps indicator */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-8">
              {([['script', u.step_script], ['video', u.step_video], ['publish', u.step_pub]] as [Step, string][]).map(([s, label], i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    step === s ? 'bg-violet-600 text-white' :
                    ['script','video','publish'].indexOf(step) > i ? 'bg-violet-900 text-violet-300' :
                    'bg-[#2A2A45] text-slate-500'
                  }`}>{i + 1}</div>
                  <span className={`text-sm ${step === s ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
                  {i < 2 && <span className="text-[#2A2A45] mx-1">→</span>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: AI Controls */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">{u.topic_label}</label>
                  <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={u.topic_ph}
                    className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors" />
                  <TrendingTopics niche={topic} lang={scriptLang === 'en' ? 'en' : 'fr'} onPick={setTopic} u={u} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{u.lang_label}</label>
                    <select value={scriptLang} onChange={(e) => setScriptLang(e.target.value)}
                      className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                      {SCRIPT_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{u.dur_label}</label>
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                      {[15, 30, 60, 90, 120].map((d) => <option key={d} value={d}>{d}s</option>)}
                    </select>
                  </div>
                </div>

                <FormatSelector value={resolution} onChange={setResolution} label={u.format_label} />
                <CaptionStylePicker value={captionStyle} onChange={setCaptionStyle} lang={lang} />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{u.mood_label}</label>
                    <select value={mood} onChange={(e) => setMood(e.target.value)}
                      className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                      {MOOD_OPTS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">{u.bpm_label}</label>
                    <input type="number" min={60} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))}
                      className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500" />
                  </div>
                </div>

                <VoiceSelector
                  voices={elVoices} voicesLoading={voicesLoading}
                  voiceId={elVoiceId} onChange={setElVoiceId}
                  customVoiceId={customVoiceId} onCustomChange={setCustomVoiceId}
                  useCustom={useCustomVoice} onUseCustom={setUseCustomVoice}
                  u={u}
                />

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">{u.platforms}</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_OPTS.map((p) => (
                      <button key={p.id} onClick={() => togglePlatform(p.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          platforms.includes(p.id) ? 'border-violet-500 bg-violet-500/20 text-violet-300' : 'border-[#2A2A45] text-slate-500 hover:border-slate-500'
                        }`}>
                        <span>{p.icon}</span> {p.label}
                        {configuredPlatforms[p.id] === false && <span className="text-[10px] text-slate-600">({lang === 'fr' ? 'non connecté' : 'not connected'})</span>}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-2">{lang === 'fr'
                    ? 'Vous pourrez aussi programmer la publication depuis le Calendrier.'
                    : 'You can also schedule publishing from the Calendar.'}</p>
                </div>

                {status === 'error' && <ErrorBox msg={errorMsg} lang={lang} />}
                {publishResults && (
                  <div className="glow-card rounded-xl p-4 space-y-2">
                    {publishResults.map((r) => (
                      <div key={r.platform} className="flex items-center gap-2 text-sm">
                        <span className={r.success ? 'text-green-400' : 'text-slate-500'}>{r.success ? '✓' : '•'}</span>
                        <span className="text-slate-200 capitalize">{r.platform}</span>
                        <span className="ml-auto text-xs text-slate-500">
                          {r.success
                            ? (r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-violet-400">{lang === 'fr' ? 'Voir' : 'View'}</a> : 'OK')
                            : r.error === 'not_configured' ? (lang === 'fr' ? 'compte non connecté' : 'account not connected') : (r.error ?? '')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {step === 'script' && (
                    <button onClick={generateAudio} disabled={isLoading || !topic.trim()}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                      {isLoading ? u.generating : u.gen_script}
                    </button>
                  )}
                  {step === 'video' && (
                    <button onClick={renderVideo} disabled={isLoading || !data.voiceReady}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                      {isLoading ? u.rendering : !data.voiceReady ? u.render_when_ready : u.gen_video}
                    </button>
                  )}
                  {step === 'publish' && (
                    <button onClick={publishAll} disabled={isLoading || !platforms.length}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-green-600 to-teal-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                      {isLoading ? u.publishing : u.publish}
                    </button>
                  )}
                </div>
              </div>

              {/* Right: AI Output */}
              <div className="space-y-4">
                {!data.title && !isLoading && (
                  <div className="glow-card rounded-3xl p-6 lg:sticky lg:top-6">
                    <div className="mx-auto w-44 aspect-[9/16] rounded-[1.6rem] border-4 border-[#24243d] bg-[radial-gradient(ellipse_at_top,_#6d28d9_0%,_#1e1b4b_50%,_#0b0b16_100%)] relative overflow-hidden">
                      <span className="absolute top-6 right-2 text-[9px] font-bold text-white/80 bg-black/30 px-1 rounded">@brand</span>
                      <span className="absolute inset-x-0 bottom-[22%] text-center text-[11px] font-black text-yellow-300 [text-shadow:0_2px_0_#000]">
                        {topic.trim() ? topic.slice(0, 40) : (lang === 'fr' ? 'Votre sujet ici' : 'Your topic here')}
                      </span>
                    </div>
                    <ol className="mt-6 space-y-2.5 text-sm">
                      {(lang === 'fr'
                        ? ['Script optimisé (accroche → valeur → appel à l’action)', 'Voix-off naturelle + musique', 'Sous-titres animés & filigrane', 'Montage au format choisi', 'Publication ou programmation']
                        : ['Optimised script (hook → value → call to action)', 'Natural voice-over + music', 'Animated captions & watermark', 'Edited in your chosen format', 'Publish now or schedule']
                      ).map((s, i) => (
                        <li key={s} className="flex items-center gap-3 text-slate-300">
                          <span className="w-6 h-6 shrink-0 rounded-full bg-violet-500/20 text-violet-300 text-xs flex items-center justify-center font-bold">{i + 1}</span>{s}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {data.title && (
                  <div className="glow-card rounded-2xl p-5">
                    <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">Title</div>
                    <h3 className="text-white font-bold">{data.title}</h3>
                  </div>
                )}
                {data.script && (
                  <div className="glow-card rounded-2xl p-5">
                    <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">{u.script_out}</div>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">{data.script}</p>
                  </div>
                )}
                {data.hashtags && data.hashtags.length > 0 && (
                  <div className="glow-card rounded-2xl p-5">
                    <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">{u.hashtags}</div>
                    <div className="flex flex-wrap gap-2">
                      {data.hashtags.map((h, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-xs">{h.startsWith('#') ? h : `#${h}`}</span>
                      ))}
                    </div>
                  </div>
                )}
                {data.voicePath && (
                  <div className="glow-card rounded-2xl p-4 space-y-3">
                    {/* Voice status */}
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🎙️</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{data.voiceReady ? u.voice_ready : u.voice_pending}</div>
                        <div className="text-xs text-slate-500 truncate">{data.voicePath.split('/').pop()}</div>
                      </div>
                      {data.voiceReady
                        ? <span className="text-green-400 text-sm">✓</span>
                        : <span className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin flex-shrink-0" />
                      }
                    </div>

                    {/* Music status */}
                    <div className="flex items-center gap-3 border-t border-[#2A2A45] pt-3">
                      <span className="text-xl">🎵</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">
                          {musicReady
                            ? (lang === 'fr' ? 'Musique prête' : 'Music ready')
                            : (lang === 'fr' ? 'Musique en génération (IA)…' : 'Music generating (AI)…')}
                        </div>
                        <div className="text-xs text-slate-500">
                          {musicReady
                            ? (lang === 'fr' ? 'Sera mixée au montage' : 'Will be mixed at render')
                            : (lang === 'fr' ? 'Montage possible sans attendre' : 'You can render without waiting')}
                        </div>
                      </div>
                      {musicReady
                        ? <span className="text-green-400 text-sm">✓</span>
                        : <span className="w-4 h-4 rounded-full border-2 border-yellow-400/60 border-t-transparent animate-spin flex-shrink-0" />
                      }
                    </div>
                  </div>
                )}
                {/* AI Image generation (after script is ready) */}
                {data.script && step !== 'script' && (
                  <div className="glow-card rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">🎨 Images IA</span>
                      {aiImages.length > 0 && (
                        <span className="text-xs text-green-400">✓ {aiImages.length} {u.ai_gen_images_ok}</span>
                      )}
                    </div>
                    {aiImgError && <p className="text-red-400 text-xs">{aiImgError}</p>}
                    <button onClick={generateAIImages} disabled={aiImgStatus === 'loading'}
                      className="w-full py-2.5 rounded-xl border border-violet-500/50 bg-violet-500/10 text-violet-300 text-sm font-medium hover:bg-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      {aiImgStatus === 'loading' ? u.ai_gen_images_loading : u.ai_gen_images}
                    </button>
                    {aiImages.length > 0 && (
                      <p className="text-xs text-slate-500">{lang === 'fr' ? 'Ces images seront utilisées au montage.' : 'These images will be used when rendering.'}</p>
                    )}
                  </div>
                )}

                {data.outputPath && (
                  <VideoPlayer outputPath={data.outputPath} label={u.video_ready} lang={lang} resolution={resolution} />
                )}
                {isLoading && (
                  <div className="glow-card rounded-2xl p-8 flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
                    <p className="text-sm text-slate-400 text-center">
                      {step === 'video'
                        ? (lang === 'fr' ? 'Montage en arrière-plan… vous pouvez quitter la page, la vidéo arrivera dans la Bibliothèque.' : 'Rendering in the background… you can leave, the video will appear in your Library.')
                        : u.generating}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── MANUAL MODE ──────────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.manual_title}</label>
                <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)}
                  placeholder={u.manual_title_ph}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.manual_script}</label>
                <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)}
                  placeholder={u.manual_script_ph} rows={6} spellCheck lang={scriptLang}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none text-sm leading-relaxed" />
                <ProofreadBar text={manualScript} setText={setManualScript} lang={scriptLang} uiLang={lang} auto={autoFix} setAuto={setAutoFix} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">{u.dur_label}</label>
                  <select value={manualDuration} onChange={(e) => setManualDuration(Number(e.target.value))}
                    className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                    {[15, 30, 60, 90, 120, 180, 300].map((d) => <option key={d} value={d}>{d}s</option>)}
                  </select>
                </div>
              </div>

              <FormatSelector value={manualResolution} onChange={setManualResolution} label={u.format_label} />
              <CaptionStylePicker value={captionStyle} onChange={setCaptionStyle} lang={lang} />

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎙️ {u.manual_voice}</label>
                <label className="flex items-center gap-3 w-full bg-[#16162A] border border-dashed border-[#2A2A45] hover:border-violet-500 rounded-xl px-4 py-3 cursor-pointer transition-colors">
                  <span className="text-violet-400 text-sm">📂</span>
                  <span className="text-slate-400 text-sm">
                    {voiceFile ? voiceFile.name : (lang === 'fr' ? 'Choisir un fichier WAV / MP3' : 'Choose WAV / MP3 file')}
                  </span>
                  <input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" className="hidden"
                    onChange={(e) => setVoiceFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🖼️ {u.manual_images}</label>
                <label className="flex items-center gap-3 w-full bg-[#16162A] border border-dashed border-[#2A2A45] hover:border-violet-500 rounded-xl px-4 py-3 cursor-pointer transition-colors">
                  <span className="text-violet-400 text-sm">📂</span>
                  <span className="text-slate-400 text-sm">
                    {imageFiles.length > 0 ? `${imageFiles.length} ${u.files_selected}` : (lang === 'fr' ? 'Choisir des images (JPG/PNG)' : 'Choose images (JPG/PNG)')}
                  </span>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" multiple className="hidden"
                    onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))} />
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🎥 {u.manual_clips}</label>
                <label className="flex items-center gap-3 w-full bg-[#16162A] border border-dashed border-[#2A2A45] hover:border-violet-500 rounded-xl px-4 py-3 cursor-pointer transition-colors">
                  <span className="text-violet-400 text-sm">📂</span>
                  <span className="text-slate-400 text-sm">
                    {clipFiles.length > 0 ? `${clipFiles.length} ${u.files_selected}` : (lang === 'fr' ? 'Choisir des clips MP4' : 'Choose MP4 clips')}
                  </span>
                  <input type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime" multiple className="hidden"
                    onChange={(e) => setClipFiles(Array.from(e.target.files ?? []))} />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setAddMusic((v) => !v)}
                  className={`w-10 h-6 rounded-full transition-all ${addMusic ? 'bg-violet-600' : 'bg-[#2A2A45]'} relative flex-shrink-0`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${addMusic ? 'left-4' : 'left-0.5'}`} />
                </button>
                <label className="text-sm text-slate-300">{u.manual_music}</label>
                {addMusic && (
                  <select value={manualMood} onChange={(e) => setManualMood(e.target.value)}
                    className="ml-2 bg-[#16162A] border border-[#2A2A45] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
                    {MOOD_OPTS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>

              <ErrorBox msg={manualError} lang={lang} />

              <button onClick={manualRender} disabled={isManualLoading || !voiceFile}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                {isManualLoading ? u.upload_render : u.manual_render}
              </button>
            </div>

            <div className="space-y-4">
              {isManualLoading && (
                <div className="glow-card rounded-2xl p-8 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
                  <p className="text-slate-400 text-sm text-center">{u.upload_render}</p>
                </div>
              )}
              {manualStep === 'done' && manualData.outputPath && (
                <>
                  <VideoPlayer outputPath={manualData.outputPath} label={u.video_ready} lang={lang} resolution={manualResolution} />
                  <button onClick={() => { setManualStep('upload'); setManualData({}); setManualStatus('idle'); setVoiceFile(null); setImageFiles([]); setClipFiles([]); }}
                    className="w-full py-3 rounded-xl border border-[#2A2A45] text-slate-400 hover:border-violet-500 hover:text-white text-sm transition-all">
                    {lang === 'fr' ? '+ Nouvelle vidéo' : '+ New video'}
                  </button>
                </>
              )}
              {manualStep === 'upload' && !isManualLoading && (
                <div className="glow-card rounded-2xl p-6 space-y-3">
                  <h3 className="text-white font-medium text-sm">{lang === 'fr' ? 'Comment ça marche' : 'How it works'}</h3>
                  <ul className="space-y-2 text-slate-400 text-xs leading-relaxed">
                    <li>🎙️ <strong className="text-slate-300">{lang === 'fr' ? 'Voix-off' : 'Voiceover'}</strong> — {lang === 'fr' ? 'votre enregistrement WAV ou MP3' : 'your WAV or MP3 recording'}</li>
                    <li>🖼️ <strong className="text-slate-300">Images</strong> — {lang === 'fr' ? 'défilent à intervalle régulier' : 'shown one after another'}</li>
                    <li>🎥 <strong className="text-slate-300">{lang === 'fr' ? 'Clips MP4' : 'MP4 clips'}</strong> — {lang === 'fr' ? 'montés dans l’ordre, prioritaires' : 'edited in order, take priority'}</li>
                    <li>📝 <strong className="text-slate-300">{lang === 'fr' ? 'Texte' : 'Text'}</strong> — {lang === 'fr' ? 'affiché en sous-titres' : 'shown as captions'}</li>
                    <li>🏷️ <strong className="text-slate-300">Brand kit</strong> — {lang === 'fr' ? 'votre filigrane ajouté automatiquement' : 'your watermark added automatically'}</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── NARRATION MODE ────────────────────────────────────────────────── */}
        {mode === 'narration' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Narration Controls */}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.narr_title}</label>
                <input value={narrTitle} onChange={(e) => setNarrTitle(e.target.value)}
                  placeholder={u.narr_title_ph}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  📖 {u.narr_text}
                  {narrText.length > 0 && (
                    <span className="ml-2 text-slate-500 font-normal text-xs">
                      {narrText.length.toLocaleString()} {u.narr_chars}
                      {narrText.length > 4500 && (
                        <span className="ml-1 text-violet-400">· {estChunks} {u.narr_chunks}</span>
                      )}
                    </span>
                  )}
                </label>
                <textarea
                  value={narrText}
                  onChange={(e) => setNarrText(e.target.value)}
                  placeholder={u.narr_text_ph}
                  rows={14} spellCheck lang={scriptLang}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-y text-sm leading-relaxed min-h-[280px]"
                />
                <ProofreadBar text={narrText} setText={setNarrText} lang={scriptLang} uiLang={lang} auto={autoFix} setAuto={setAutoFix} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.lang_label}</label>
                <select value={scriptLang} onChange={(e) => setScriptLang(e.target.value)}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                  {SCRIPT_LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>

              <VoiceSelector
                voices={elVoices} voicesLoading={voicesLoading}
                voiceId={narrVoiceId} onChange={setNarrVoiceId}
                customVoiceId={narrCustomId} onCustomChange={setNarrCustomId}
                useCustom={narrUseCustom} onUseCustom={setNarrUseCustom}
                u={{ ...u, voice_label: u.narr_voice }}
              />

              <FormatSelector value={narrResolution} onChange={setNarrResolution} label={u.format_label} />

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">🖼️ {u.narr_images}</label>
                <label className="flex items-center gap-3 w-full bg-[#16162A] border border-dashed border-[#2A2A45] hover:border-violet-500 rounded-xl px-4 py-3 cursor-pointer transition-colors">
                  <span className="text-violet-400 text-sm">📂</span>
                  <span className="text-slate-400 text-sm">
                    {narrImageFiles.length > 0
                      ? `${narrImageFiles.length} ${u.files_selected}`
                      : (lang === 'fr' ? 'Choisir des images (JPG/PNG)' : 'Choose images (JPG/PNG)')}
                  </span>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" multiple className="hidden"
                    onChange={(e) => setNarrImageFiles(Array.from(e.target.files ?? []))} />
                </label>
                {narrImageFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {narrImageFiles.map((f, i) => (
                      <span key={i} className="text-xs px-2 py-1 bg-[#2A2A45] text-slate-400 rounded-lg">{f.name}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI image generation toggle */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setNarrGenImages((v) => !v)}
                    className={`w-10 h-6 rounded-full transition-all ${narrGenImages ? 'bg-violet-600' : 'bg-[#2A2A45]'} relative flex-shrink-0`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${narrGenImages ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <label className="text-sm text-slate-300">
                    {narrGenImages ? u.narr_gen_images_on : u.narr_gen_images}
                  </label>
                  {narrGenImages && (
                    <select value={narrImageCount} onChange={(e) => setNarrImageCount(Number(e.target.value))}
                      className="ml-auto bg-[#16162A] border border-[#2A2A45] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500">
                      {[2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} img</option>)}
                    </select>
                  )}
                </div>
                {narrGenImages && (
                  <input value={narrImageStyle} onChange={(e) => setNarrImageStyle(e.target.value)}
                    placeholder={u.narr_style_ph}
                    className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 text-sm transition-colors" />
                )}
              </div>

              {/* Music section */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">{u.narr_music}</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setNarrAddMusic((v) => !v)}
                    className={`w-10 h-6 rounded-full transition-all ${narrAddMusic ? 'bg-violet-600' : 'bg-[#2A2A45]'} relative flex-shrink-0`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${narrAddMusic ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="text-sm text-slate-300">{u.narr_music_gen}</span>
                </div>

                {narrAddMusic && (
                  <div className="space-y-3 pl-2">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-1">{u.narr_music_mood}</label>
                        <select value={narrMusicMood} onChange={(e) => setNarrMusicMood(e.target.value)}
                          className="w-full bg-[#16162A] border border-[#2A2A45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500">
                          {MOOD_OPTS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-slate-500 mb-1">{u.narr_music_bpm}</label>
                        <input type="number" value={narrMusicBpm} min={60} max={180}
                          onChange={(e) => setNarrMusicBpm(Number(e.target.value))}
                          className="w-full bg-[#16162A] border border-[#2A2A45] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        {u.narr_music_vol} — {Math.round(narrMusicVolume * 100)}%
                      </label>
                      <input type="range" min={0} max={0.5} step={0.05} value={narrMusicVolume}
                        onChange={(e) => setNarrMusicVolume(Number(e.target.value))}
                        className="w-full accent-violet-500" />
                    </div>
                  </div>
                )}

                {/* Music file upload (alternative) */}
                <label className="flex items-center gap-3 w-full bg-[#16162A] border border-dashed border-[#2A2A45] hover:border-violet-500 rounded-xl px-4 py-3 cursor-pointer transition-colors">
                  <span className="text-violet-400 text-sm">🎵</span>
                  <span className="text-slate-400 text-sm">
                    {narrMusicFile ? narrMusicFile.name : u.narr_music_upload}
                  </span>
                  <input type="file" accept=".mp3,.wav,audio/*" className="hidden"
                    onChange={(e) => { setNarrMusicFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setNarrAddMusic(false); }} />
                </label>
                {narrMusicFile && (
                  <button onClick={() => setNarrMusicFile(null)}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors">
                    ✕ {lang === 'fr' ? 'Retirer la musique' : 'Remove music'}
                  </button>
                )}
              </div>

              <ErrorBox msg={narrError} lang={lang} />

              <button
                onClick={narrRender}
                disabled={isNarrLoading || !narrText.trim()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                {isNarrLoading ? u.narr_rendering : u.narr_render}
              </button>
            </div>

            {/* Right: Narration Output */}
            <div className="space-y-4">
              {narrStatus === 'loading' && (
                <div className="glow-card rounded-2xl p-8 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
                  <p className="text-slate-400 text-sm text-center">{u.narr_rendering}</p>
                  <div className="text-center space-y-1">
                    {narrText.length > 4500 && (
                      <p className="text-slate-600 text-xs">🎙️ {estChunks} {u.narr_chunks}</p>
                    )}
                    {narrGenImages && (
                      <p className="text-slate-600 text-xs">🎨 {narrImageCount} images Stability AI</p>
                    )}
                    <p className="text-slate-600 text-xs">🔤 Whisper word sync</p>
                  </div>
                </div>
              )}

              {narrStatus === 'processing' && (
                <div className="glow-card rounded-2xl p-6 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                  <p className="text-amber-400 text-sm font-medium text-center">{u.narr_processing}</p>
                  <p className="text-slate-500 text-xs text-center leading-relaxed">{u.narr_processing_hint}</p>
                  <div className="w-full mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <p className="text-amber-300 text-xs">Job ID: <code className="font-mono">{narrJobId}</code></p>
                    <p className="text-slate-500 text-xs mt-1">
                      {lang === 'fr' ? 'Vérification toutes les 30 secondes' : 'Checking every 30 seconds'}
                    </p>
                  </div>
                </div>
              )}

              {narrStatus === 'done' && narrData.outputPath && (
                <>
                  <VideoPlayer outputPath={narrData.outputPath} label={u.video_ready} lang={lang} resolution={narrResolution} />
                  <div className="glow-card rounded-2xl p-4 space-y-2">
                    {narrData.duration && (
                      <div className="flex items-center gap-3">
                        <span className="text-lg">⏱</span>
                        <div className="text-sm text-slate-300">
                          {lang === 'fr' ? 'Durée' : 'Duration'}: <strong className="text-white">{narrData.duration}s</strong>
                          <span className="text-slate-500 ml-2">({narrText.length.toLocaleString()} {u.narr_chars})</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🔤</span>
                      <span className="text-sm text-slate-300">
                        {lang === 'fr' ? 'Sous-titres synchronisés (Whisper)' : 'Whisper-synced subtitles'} <span className="text-green-400">✓</span>
                      </span>
                    </div>
                    {narrGenImages && (
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🎨</span>
                        <span className="text-sm text-slate-300">
                          {lang === 'fr' ? 'Images IA générées' : 'AI images generated'} <span className="text-green-400">✓</span>
                        </span>
                      </div>
                    )}

                    {/* Music status */}
                    {narrAddMusic && (
                      <div className="flex items-center gap-3">
                        <span className="text-lg">🎵</span>
                        {narrMusicReady ? (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-sm text-green-400">
                              {lang === 'fr' ? 'Musique prête' : 'Music ready'} ✓
                            </span>
                            <button
                              onClick={async () => {
                                setNarrMusicMixing(true);
                                try {
                                  const r = await fetch(`/api/media/add-narration-music/${narrJobId}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ musicVolume: narrMusicVolume }),
                                  });
                                  const j = await r.json();
                                  if (!r.ok) throw new Error(j.error);
                                  setNarrData((d) => ({ ...d, outputPath: j.data.outputPath }));
                                  setNarrMusicReady(false); // consumed
                                } catch (e) { setNarrError(String(e)); }
                                finally { setNarrMusicMixing(false); }
                              }}
                              disabled={narrMusicMixing}
                              className="ml-auto px-3 py-1 rounded-lg bg-violet-600 text-white text-xs hover:bg-violet-500 disabled:opacity-40 transition-all">
                              {narrMusicMixing
                                ? (lang === 'fr' ? 'Mixage...' : 'Mixing...')
                                : (lang === 'fr' ? 'Ajouter au film' : 'Add to video')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border border-amber-500 border-t-transparent animate-spin inline-block" />
                            {lang === 'fr' ? 'Musique en génération (MusicGen CPU)...' : 'Music generating (MusicGen CPU)...'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { if (narrPollRef.current) clearInterval(narrPollRef.current); if (narrMusicPollRef.current) clearInterval(narrMusicPollRef.current); setNarrStatus('idle'); setNarrData({}); setNarrText(''); setNarrTitle(''); setNarrImageFiles([]); setNarrJobId(''); setNarrMusicReady(false); }}
                    className="w-full py-3 rounded-xl border border-[#2A2A45] text-slate-400 hover:border-violet-500 hover:text-white text-sm transition-all">
                    {lang === 'fr' ? '+ Nouvelle narration' : '+ New narration'}
                  </button>
                </>
              )}

              {narrStatus !== 'done' && !isNarrLoading && (
                <div className="glow-card rounded-2xl p-6 space-y-3">
                  <h3 className="text-white font-medium text-sm">
                    {lang === 'fr' ? 'Mode Narration — comment ça marche' : 'Narration Mode — how it works'}
                  </h3>
                  <ul className="space-y-2 text-slate-400 text-xs leading-relaxed">
                    <li>📖 <strong className="text-slate-300">{lang === 'fr' ? 'Texte long' : 'Long text'}</strong> — {u.narr_how1}</li>
                    <li>🎙️ <strong className="text-slate-300">ElevenLabs</strong> — {u.narr_how2}</li>
                    <li>⏱️ <strong className="text-slate-300">{lang === 'fr' ? 'Durée auto' : 'Auto duration'}</strong> — {u.narr_how3}</li>
                    <li>🖼️ <strong className="text-slate-300">Images</strong> — {u.narr_how4}</li>
                    <li>📐 <strong className="text-slate-300">Format</strong> — {u.narr_how5}</li>
                  </ul>
                  <div className="mt-4 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <p className="text-violet-300 text-xs">
                      {lang === 'fr'
                        ? 'Exemple : Matthieu chapitre 1 (~800 mots) → ~5-6 minutes de narration'
                        : 'Example: Matthew chapter 1 (~800 words) → ~5-6 minutes of narration'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
