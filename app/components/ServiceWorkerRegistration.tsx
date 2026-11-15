'use client';

import { useEffect, useRef, useState } from 'react';

const CHECK_EVERY_MS = 20 * 60_000;
const AUTO_APPLY_S = 15;

/**
 * Registers the service worker and keeps the app up to date on its own:
 * it checks for a new version every 20 minutes and whenever the tab comes back to the front.
 * A new version is applied at once if the tab is in the background; otherwise a banner counts
 * down and reloads (the user can apply now or postpone, e.g. while typing a long text).
 */
export default function ServiceWorkerRegistration() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [left, setLeft] = useState(AUTO_APPLY_S);
  const [postponed, setPostponed] = useState(false);
  const reloading = useRef(false);
  const en = typeof window !== 'undefined' && window.location.pathname.startsWith('/en');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let reg: ServiceWorkerRegistration | undefined;

    const offer = (w: ServiceWorker | null) => {
      if (!w || !navigator.serviceWorker.controller) return; // first install: nothing to replace
      if (document.visibilityState === 'hidden') w.postMessage('SKIP_WAITING');
      else { setWaiting(w); setLeft(AUTO_APPLY_S); setPostponed(false); }
    };

    navigator.serviceWorker.register('/api/sw', { scope: '/', updateViaCache: 'none' }).then((r) => {
      reg = r;
      offer(r.waiting);
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
    }).catch(() => {});

    const check = () => { reg?.update().catch(() => {}); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
      else if (reg?.waiting) reg.waiting.postMessage('SKIP_WAITING');
    };
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    });
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  useEffect(() => {
    if (!waiting || postponed) return;
    if (left <= 0) { waiting.postMessage('SKIP_WAITING'); return; }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [waiting, left, postponed]);

  if (!waiting) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-violet-500/40 bg-[#16162A]/95 backdrop-blur px-4 py-3 shadow-2xl flex items-center gap-3 text-sm">
      <span className="text-lg">✨</span>
      <span className="flex-1 text-slate-200">
        {en ? 'A new version of Synthia is ready' : 'Une nouvelle version de Synthia est prête'}
        {!postponed && <span className="text-slate-400"> — {en ? `updating in ${left}s` : `mise à jour dans ${left} s`}</span>}
      </span>
      {!postponed && (
        <button onClick={() => setPostponed(true)} className="text-xs text-slate-400 hover:text-white">{en ? 'Later' : 'Plus tard'}</button>
      )}
      <button onClick={() => waiting.postMessage('SKIP_WAITING')}
        className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white font-semibold">{en ? 'Update' : 'Mettre à jour'}</button>
    </div>
  );
}
