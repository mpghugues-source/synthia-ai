'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader, btnPrimary, btnGhost } from '@/components/dashboard/Shell';

type Lang = 'fr' | 'en';

interface Account { platform: string; displayName: string | null; avatarUrl: string | null; connectedAt: string; needsReconnect: boolean }

const CARDS = [
  { id: 'youtube', name: 'YouTube', icon: '▶', color: 'from-red-600 to-red-500', live: true,
    fr: 'Publiez vos Shorts et vidéos sur votre chaîne.', en: 'Publish Shorts and videos to your channel.' },
  { id: 'tiktok', name: 'TikTok', icon: '♪', color: 'from-slate-900 to-pink-600', live: true,
    fr: 'Publication directe ou brouillon dans l’appli TikTok.', en: 'Direct post or draft in the TikTok app.' },
  { id: 'instagram', name: 'Instagram', icon: '◉', color: 'from-fuchsia-600 to-amber-500', live: true,
    fr: 'Reels sur votre compte professionnel (créateur ou entreprise).', en: 'Reels on your professional (creator or business) account.' },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: 'from-blue-700 to-blue-500', live: true,
    fr: 'Vidéos sur votre Page Facebook.', en: 'Videos on your Facebook Page.' },
  { id: 'twitter', name: 'X', icon: '✕', color: 'from-zinc-800 to-zinc-600', live: true,
    fr: 'Posts vidéo sur votre compte X (Twitter).', en: 'Video posts on your X (Twitter) account.' },
];

const MESSAGES: Record<string, [string, string]> = {
  denied: ['Connexion annulée.', 'Connection cancelled.'],
  state: ['La connexion a expiré ou provient d’une autre session. Réessayez.', 'The connection expired or came from another session. Please retry.'],
  no_channel: ['Ce compte Google n’a pas de chaîne YouTube. Créez-en une sur youtube.com puis réessayez.', 'This Google account has no YouTube channel. Create one on youtube.com and retry.'],
  missing_scope: ['Cochez l’autorisation « Gérer vos vidéos YouTube » pour que Synthia puisse publier.', 'Allow “Manage your YouTube videos” so Synthia can publish.'],
  not_configured: ['Cette connexion n’est pas encore activée sur Synthia. Réessayez bientôt.', 'This connection is not enabled on Synthia yet. Please try again soon.'],
  failed: ['La connexion a échoué. Réessayez.', 'Connection failed. Please retry.'],
  unsupported: ['Réseau non pris en charge.', 'Unsupported network.'],
  no_page: ['Aucune Page Facebook gérée par ce compte. Créez une Page ou demandez le rôle de créateur de contenu.', 'No Facebook Page managed by this account. Create a Page or ask for a content role.'],
};

export default function AccountsPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const fr = lang === 'fr';
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetch('/api/social/accounts').then((r) => r.json()).then((j) => { setAccounts(j.accounts ?? []); setAvailable(j.available ?? {}); })
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search);
    const connected = q.get('connected');
    const error = q.get('error');
    const label = CARDS.find((c) => c.id === connected)?.name ?? connected;
    if (connected) setNotice({ ok: true, text: fr ? `✓ Compte ${label} connecté.` : `✓ ${label} account connected.` });
    else if (error) setNotice({ ok: false, text: (MESSAGES[error] ?? MESSAGES.failed)[fr ? 0 : 1] });
    if (connected || error) window.history.replaceState(null, '', window.location.pathname);
  }, [load, fr]);

  const disconnect = async (platform: string) => {
    if (!confirm(fr ? 'Déconnecter ce compte ? Les publications programmées vers ce réseau échoueront.' : 'Disconnect this account? Scheduled posts to this network will fail.')) return;
    await fetch(`/api/social/accounts/${platform}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title={fr ? 'Comptes connectés' : 'Connected accounts'}
        subtitle={fr
          ? 'Connectez vos propres comptes : Synthia publie vos vidéos dessus, immédiatement ou à l’heure programmée. Vous pouvez retirer l’accès à tout moment.'
          : 'Connect your own accounts: Synthia publishes your videos there, right away or at the scheduled time. You can revoke access at any time.'} />

      {notice && (
        <div className={`mb-6 p-4 rounded-2xl text-sm border ${notice.ok ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {CARDS.map((c) => {
          const acc = accounts?.find((a) => a.platform === c.id);
          const canConnect = c.live && available[c.id];
          return (
            <div key={c.id} className={`rounded-3xl border border-[#2A2A45] bg-[#13132A] p-5 flex flex-col gap-4 ${c.live ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-3">
                <span className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${c.color} flex items-center justify-center text-white font-black`}>{c.icon}</span>
                <div className="min-w-0">
                  <div className="text-white font-semibold">{c.name}</div>
                  <div className="text-xs text-slate-400">{fr ? c.fr : c.en}</div>
                </div>
              </div>

              {accounts === null ? <div className="h-10 rounded-xl bg-white/5 animate-pulse" /> : acc ? (
                <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {acc.avatarUrl ? <img src={acc.avatarUrl} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
                    : <span className="w-9 h-9 rounded-full bg-white/10" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">{acc.displayName ?? c.name}</div>
                    <div className={`text-[11px] ${acc.needsReconnect ? 'text-amber-300' : 'text-green-400'}`}>
                      {acc.needsReconnect ? (fr ? 'Accès expiré — reconnectez' : 'Access expired — reconnect') : (fr ? '● Connecté' : '● Connected')}
                    </div>
                  </div>
                  {acc.needsReconnect && <a href={`/api/social/connect/${c.id}?lang=${lang}`} className={btnGhost}>{fr ? 'Reconnecter' : 'Reconnect'}</a>}
                  <button onClick={() => disconnect(c.id)} className={`${btnGhost} hover:border-red-500 hover:text-red-300`}>{fr ? 'Déconnecter' : 'Disconnect'}</button>
                </div>
              ) : c.live ? (
                canConnect
                  ? <a href={`/api/social/connect/${c.id}?lang=${lang}`} className={`${btnPrimary} text-center`}>{fr ? `Connecter ${c.name}` : `Connect ${c.name}`}</a>
                  : <div className="text-xs text-slate-500 rounded-xl border border-dashed border-[#2A2A45] p-3">{fr ? 'Activation en cours par l’équipe Synthia.' : 'Being enabled by the Synthia team.'}</div>
              ) : (
                <div className="text-xs text-slate-500 rounded-xl border border-dashed border-[#2A2A45] p-3">{fr ? 'Bientôt disponible' : 'Coming soon'}</div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 mt-8 leading-relaxed">
        {fr ? 'Synthia ne publie que les vidéos que vous choisissez et ne lit ni vos messages ni vos statistiques. Vos accès sont chiffrés. Vous pouvez aussi retirer l’autorisation depuis ' : 'Synthia only posts the videos you choose and never reads your messages or analytics. Your access tokens are encrypted. You can also revoke access from '}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="text-violet-400">Google</a>
        {fr ? ', TikTok, Instagram, Facebook ou X (réglages de sécurité, applis connectées). ' : ', TikTok, Instagram, Facebook or X (security settings, connected apps). '}
        <a href={`/${lang}/privacy`} className="text-violet-400">{fr ? 'Politique de confidentialité' : 'Privacy policy'}</a>
      </p>
    </div>
  );
}
