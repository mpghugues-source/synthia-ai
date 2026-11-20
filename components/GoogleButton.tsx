'use client';

import { useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';

/**
 * "Continue with Google / Facebook / Instagram / X": one click creates the Synthia account or signs in.
 * Only the providers enabled on the server are shown.
 */
const BUTTONS: { id: string; label: string; cls: string; icon: React.ReactNode }[] = [
  { id: 'google', label: 'Google', cls: 'bg-white text-slate-800 hover:bg-slate-100', icon: (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/>
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/>
    </svg>) },
  { id: 'facebook', label: 'Facebook', cls: 'bg-[#1877F2] text-white hover:opacity-90', icon: <span className="font-black text-lg leading-none">f</span> },
  { id: 'instagram', label: 'Instagram', cls: 'bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-400 text-white hover:opacity-90', icon: <span className="font-black">◉</span> },
  { id: 'twitter', label: 'X', cls: 'bg-black text-white border border-white/20 hover:bg-zinc-900', icon: <span className="font-black">𝕏</span> },
];

export default function GoogleButton({ lang }: { lang: 'fr' | 'en' }) {
  const [enabled, setEnabled] = useState<string[]>([]);
  useEffect(() => { getProviders().then((p) => setEnabled(Object.keys(p ?? {}))).catch(() => {}); }, []);
  const shown = BUTTONS.filter((b) => enabled.includes(b.id));
  if (!shown.length) return null;
  const fr = lang === 'fr';
  return (
    <>
      <div className="space-y-2.5">
        {shown.map((b) => (
          <button key={b.id} type="button" onClick={() => signIn(b.id, { callbackUrl: `/${lang}/dashboard` })}
            className={`w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold transition-all ${b.cls}`}>
            {b.icon}{fr ? `Continuer avec ${b.label}` : `Continue with ${b.label}`}
          </button>
        ))}
      </div>
      {enabled.includes('instagram') && (
        <p className="text-[11px] text-slate-500 mt-2 text-center">
          {fr ? 'Instagram : comptes professionnels (créateur ou entreprise) uniquement.' : 'Instagram: professional (creator or business) accounts only.'}
        </p>
      )}
      <div className="flex items-center gap-3 my-5 text-xs text-slate-500">
        <span className="flex-1 h-px bg-[#2A2A45]" />{fr ? 'ou avec votre e-mail' : 'or with your e-mail'}<span className="flex-1 h-px bg-[#2A2A45]" />
      </div>
    </>
  );
}
