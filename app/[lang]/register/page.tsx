'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const params = useParams();
  const lang   = params?.lang === 'en' ? 'en' : 'fr';

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const t = lang === 'fr'
    ? { title: 'Créer un compte', sub: 'Commencez gratuitement — 3 vidéos offertes', name: 'Nom', email: 'Email', pass: 'Mot de passe (8 caractères min)', btn: "Créer mon compte", hasAccount: 'Déjà un compte ?', login: 'Se connecter', loading: 'Création...', err_short: 'Mot de passe trop court (8 min)', err_used: 'Email déjà utilisé' }
    : { title: 'Create account', sub: 'Start free — 3 videos included', name: 'Name', email: 'Email', pass: 'Password (8 chars min)', btn: 'Create account', hasAccount: 'Already have an account?', login: 'Sign in', loading: 'Creating...', err_short: 'Password too short (8 min)', err_used: 'Email already taken' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError(t.err_short); return; }
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const json = await res.json();

    if (!res.ok) {
      setError(res.status === 409 ? t.err_used : json.error);
      setLoading(false);
      return;
    }

    // Auto-login after register
    await signIn('credentials', { email, password, redirect: false });
    const plan = new URLSearchParams(window.location.search).get('plan');
    router.push(plan ? `/${lang}/dashboard/account` : `/${lang}/dashboard`);
  };

  return (
    <div className="min-h-screen bg-[#0F0F1A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold">S</div>
          <span className="text-white font-bold text-xl">Synthia AI</span>
        </div>

        <div className="bg-[#16162A] border border-[#2A2A45] rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-1">{t.title}</h1>
          <p className="text-slate-500 text-sm mb-6">{t.sub}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t.name}</label>
              <input
                type="text"
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t.email}</label>
              <input
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t.pass}</label>
              <input
                type="password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F0F1A] border border-[#2A2A45] rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-900/30 border border-red-800 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold disabled:opacity-50 hover:opacity-90 transition-all">
              {loading ? t.loading : t.btn}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            {t.hasAccount}{' '}
            <Link href={`/${lang}/login`} className="text-violet-400 hover:text-violet-300 transition-colors">
              {t.login}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
