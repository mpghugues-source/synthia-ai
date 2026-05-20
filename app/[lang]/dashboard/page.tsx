'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';

type Lang = 'fr' | 'en';
type Step = 'script' | 'audio' | 'video' | 'publish';
type JobStatus = 'idle' | 'loading' | 'done' | 'error';

interface GeneratedData {
  jobId?: string;
  title?: string;
  script?: string;
  hashtags?: string[];
  voicePath?: string;
  musicPath?: string;
  outputPath?: string;
}

const PLATFORM_OPTS = [
  { id: 'youtube',   label: 'YouTube Shorts', icon: '▶' },
  { id: 'tiktok',    label: 'TikTok',         icon: '♪' },
  { id: 'instagram', label: 'Instagram Reels', icon: '◉' },
  { id: 'facebook',  label: 'Facebook',        icon: 'f' },
  { id: 'twitter',   label: 'X / Twitter',     icon: '✕' },
] as const;

const MOOD_OPTS = ['energetic','calm','dramatic','happy','corporate','epic','cinematic','lofi'] as const;

const UI: Record<Lang, Record<string, string>> = {
  fr: {
    title:       'Studio IA',
    topic_label: 'Sujet / Niche',
    topic_ph:    'ex: Crypto, Fitness, Humour, Business...',
    lang_label:  'Langue du script',
    dur_label:   'Durée (secondes)',
    mood_label:  'Ambiance musicale',
    bpm_label:   'BPM',
    platforms:   'Plateformes de publication',
    gen_script:  'Générer le script & la voix',
    gen_video:   'Monter la vidéo',
    publish:     'Publier partout',
    publishing:  'Publication en cours...',
    rendering:   'Montage en cours...',
    generating:  'Génération IA en cours...',
    step_script: '1. Script & Audio',
    step_video:  '2. Montage Vidéo',
    step_pub:    '3. Publication',
    script_out:  'Script généré',
    hashtags:    'Hashtags',
    voice_ready: 'Voix-off prête',
    music_ready: 'Musique prête',
    video_ready: 'Vidéo prête',
  },
  en: {
    title:       'AI Studio',
    topic_label: 'Topic / Niche',
    topic_ph:    'e.g. Crypto, Fitness, Comedy, Business...',
    lang_label:  'Script language',
    dur_label:   'Duration (seconds)',
    mood_label:  'Music mood',
    bpm_label:   'BPM',
    platforms:   'Publish to platforms',
    gen_script:  'Generate script & voice',
    gen_video:   'Render video',
    publish:     'Publish everywhere',
    publishing:  'Publishing...',
    rendering:   'Rendering...',
    generating:  'AI generating...',
    step_script: '1. Script & Audio',
    step_video:  '2. Video Render',
    step_pub:    '3. Publish',
    script_out:  'Generated script',
    hashtags:    'Hashtags',
    voice_ready: 'Voiceover ready',
    music_ready: 'Music ready',
    video_ready: 'Video ready',
  },
};

export default function DashboardPage() {
  const params  = useParams();
  const rawLang = Array.isArray(params?.lang) ? params.lang[0] : (params?.lang ?? 'fr');
  const lang    = (rawLang === 'en' ? 'en' : 'fr') as Lang;
  const u       = UI[lang];

  const [topic,      setTopic]      = useState('');
  const [scriptLang, setScriptLang] = useState<'fr' | 'en'>(lang);
  const [duration,   setDuration]   = useState(60);
  const [mood,       setMood]       = useState<string>('energetic');
  const [bpm,        setBpm]        = useState(120);
  const [platforms,  setPlatforms]  = useState<string[]>(['youtube', 'tiktok']);

  const [status,  setStatus]  = useState<JobStatus>('idle');
  const [step,    setStep]    = useState<Step>('script');
  const [data,    setData]    = useState<GeneratedData>({});
  const [errorMsg, setError]  = useState('');

  const togglePlatform = (id: string) =>
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const generateAudio = useCallback(async () => {
    if (!topic.trim()) return;
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/media/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, niche: topic, duration, platform: 'YouTube Shorts', lang: scriptLang, mood, bpm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setData(json.data);
      setStep('video');
      setStatus('done');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [topic, duration, scriptLang, mood, bpm]);

  const renderVideo = useCallback(async () => {
    if (!data.jobId || !data.voicePath) return;
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/media/render-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId:     data.jobId,
          voicePath: data.voicePath,
          musicPath: data.musicPath,
          title:     data.title,
          script:    data.script,
          hashtags:  data.hashtags,
          duration,
          platforms: [],
          async:     false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setData((d) => ({ ...d, outputPath: json.data.outputPath }));
      setStep('publish');
      setStatus('done');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [data, duration]);

  const publishAll = useCallback(async () => {
    if (!data.outputPath) return;
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath:   data.outputPath,
          title:       data.title,
          description: data.script?.slice(0, 200),
          hashtags:    data.hashtags,
          platforms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error');
      setStatus('done');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [data, platforms]);

  const isLoading = status === 'loading';

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-slate-200">
      {/* Header */}
      <header className="border-b border-[#2A2A45] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">S</div>
          <span className="font-bold text-lg text-white">Synthia AI</span>
          <span className="text-slate-600 mx-2">/</span>
          <span className="text-slate-400 text-sm">{u.title}</span>
        </div>
        <a href={`/${lang}`} className="text-sm text-slate-500 hover:text-white transition-colors">← Home</a>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Steps indicator */}
        <div className="flex items-center gap-4 mb-10">
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
          {/* Left: Controls */}
          <div className="space-y-6">
            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">{u.topic_label}</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={u.topic_ph}
                className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {/* Script language + Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.lang_label}</label>
                <select
                  value={scriptLang}
                  onChange={(e) => setScriptLang(e.target.value as 'fr' | 'en')}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.dur_label}</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                  {[15, 30, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>{d}s</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mood + BPM */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.mood_label}</label>
                <select
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500">
                  {MOOD_OPTS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{u.bpm_label}</label>
                <input
                  type="number" min={60} max={200}
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            {/* Platforms */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">{u.platforms}</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORM_OPTS.map((p) => (
                  <button key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      platforms.includes(p.id)
                        ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                        : 'border-[#2A2A45] text-slate-500 hover:border-slate-500'
                    }`}>
                    <span>{p.icon}</span> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {status === 'error' && (
              <div className="p-4 rounded-xl bg-red-900/30 border border-red-800 text-red-400 text-sm">
                {errorMsg}
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {step === 'script' && (
                <button onClick={generateAudio} disabled={isLoading || !topic.trim()}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                  {isLoading ? u.generating : u.gen_script}
                </button>
              )}
              {step === 'video' && (
                <button onClick={renderVideo} disabled={isLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all">
                  {isLoading ? u.rendering : u.gen_video}
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

          {/* Right: Output preview */}
          <div className="space-y-4">
            {data.title && (
              <div className="glow-card rounded-2xl p-5">
                <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">Title</div>
                <h3 className="text-white font-bold">{data.title}</h3>
              </div>
            )}

            {data.script && (
              <div className="glow-card rounded-2xl p-5">
                <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">{u.script_out}</div>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {data.script}
                </p>
              </div>
            )}

            {data.hashtags && data.hashtags.length > 0 && (
              <div className="glow-card rounded-2xl p-5">
                <div className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-3">{u.hashtags}</div>
                <div className="flex flex-wrap gap-2">
                  {data.hashtags.map((h, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-violet-500/20 text-violet-300 text-xs">
                      {h.startsWith('#') ? h : `#${h}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {data.voicePath && (
              <div className="glow-card rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">🎙️</span>
                <div>
                  <div className="text-sm font-medium text-white">{u.voice_ready}</div>
                  <div className="text-xs text-slate-500">{data.voicePath.split('/').pop()}</div>
                </div>
                <span className="ml-auto text-green-400 text-sm">✓</span>
              </div>
            )}

            {data.musicPath && (
              <div className="glow-card rounded-2xl p-4 flex items-center gap-3">
                <span className="text-2xl">🎵</span>
                <div>
                  <div className="text-sm font-medium text-white">{u.music_ready}</div>
                  <div className="text-xs text-slate-500">{data.musicPath.split('/').pop()}</div>
                </div>
                <span className="ml-auto text-green-400 text-sm">✓</span>
              </div>
            )}

            {data.outputPath && (
              <div className="glow-card rounded-2xl p-4 flex items-center gap-3 border-green-700">
                <span className="text-2xl">🎬</span>
                <div>
                  <div className="text-sm font-medium text-white">{u.video_ready}</div>
                  <div className="text-xs text-slate-500">{data.outputPath.split('/').pop()}</div>
                </div>
                <span className="ml-auto text-green-400 text-sm">✓</span>
              </div>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-10 h-10 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
