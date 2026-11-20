'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import GoogleButton from '@/components/GoogleButton';

export default function LoginPage() {
  const router = useRouter();
  const params = useParams();
  const lang   = params?.lang === 'en' ? 'en' : 'fr';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const t = lang === 'fr'
    ? { title: 'Connexion', sub: 'Accédez à votre studio IA', email: 'Email', pass: 'Mot de passe', btn: 'Se connecter', err_creds: 'Email ou mot de passe incorrect', noAccount: "Pas encore de compte ?", register: "S'inscrire", loading: 'Connexion...' }
    : { title: 'Sign In', sub: 'Access your AI studio', email: 'Email', pass: 'Password', btn: 'Sign in', err_creds: 'Invalid email or password', noAccount: 'No account yet?', register: 'Register', loading: 'Signing in...' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await signIn('credentials', {
      email, password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t.err_creds);
    } else {
      router.push(`/${lang}/dashboard`);
    }
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

          <GoogleButton lang={lang} />

          <form onSubmit={handleSubmit} className="space-y-4">
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
                type="password" required
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
            {t.noAccount}{' '}
            <Link href={`/${lang}/register`} className="text-violet-400 hover:text-violet-300 transition-colors">
              {t.register}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
