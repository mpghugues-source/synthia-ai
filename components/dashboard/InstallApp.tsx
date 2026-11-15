'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** "Install the app" button: native prompt on Chrome/Edge/Android, instructions on iPhone/iPad. */
export default function InstallApp({ lang, compact = false }: { lang: 'fr' | 'en'; compact?: boolean }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (installed || (!evt && !ios)) return null;
  const label = lang === 'fr' ? 'Installer l’application' : 'Install the app';

  return (
    <>
      <button
        onClick={async () => {
          if (evt) { await evt.prompt(); const c = await evt.userChoice; if (c.outcome === 'accepted') setEvt(null); }
          else setShowIos(true);
        }}
        className={compact
          ? 'text-slate-300 text-xs px-2 py-1 rounded-lg border border-white/10'
          : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 border border-dashed border-violet-500/40 hover:bg-violet-500/10'}>
        <span>📲</span>{compact ? (lang === 'fr' ? 'Installer' : 'Install') : label}
      </button>
      {showIos && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={() => setShowIos(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#16162A] border border-white/10 p-5 text-sm text-slate-200" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-white mb-2">{label}</p>
            <p>{lang === 'fr'
              ? 'Dans Safari, touchez le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».'
              : 'In Safari, tap the Share button (square with an arrow), then “Add to Home Screen”.'}</p>
            <button onClick={() => setShowIos(false)} className="mt-4 w-full py-2 rounded-xl bg-violet-600 text-white">OK</button>
          </div>
        </div>
      )}
    </>
  );
}
