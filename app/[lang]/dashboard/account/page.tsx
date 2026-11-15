'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PageHeader, useMe } from '@/components/dashboard/Shell';
import { whatsappLink } from '@/lib/contact';
import Email from '@/components/Email';
import { PLAN_PRICES, formatPrice, type Currency } from '@/lib/pricing';

type Lang = 'fr' | 'en';

declare global {
  interface Window { FlutterwaveCheckout?: (config: Record<string, unknown>) => void }
}

const PLANS = [
  { id: 'starter', name: 'Starter', videos: 10,
    fr: ['10 vidéos / mois', 'Scripts en 8 langues', 'Voix IA premium', 'Viral Lab', 'Brand kit'],
    en: ['10 videos / month', 'Scripts in 8 languages', 'Premium AI voices', 'Viral Lab', 'Brand kit'] },
  { id: 'creator', name: 'Creator', videos: 50, popular: true,
    fr: ['50 vidéos / mois', 'Tout Starter', 'Calendrier & publication auto', 'Narrations longues', 'Images IA', 'Support prioritaire'],
    en: ['50 videos / month', 'Everything in Starter', 'Calendar & auto-publishing', 'Long narrations', 'AI images', 'Priority support'] },
  { id: 'studio', name: 'Studio', videos: -1,
    fr: ['Vidéos illimitées', 'Tout Creator', 'Multi-comptes sociaux', 'Accès API', 'Accompagnement dédié'],
    en: ['Unlimited videos', 'Everything in Creator', 'Multiple social accounts', 'API access', 'Dedicated onboarding'] },
];

export default function AccountPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const me = useMe();
  const { data: session } = useSession();
  const flwKey = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '';

  const upgrade = (plan: typeof PLANS[number], currency: Currency) => {
    const email = session?.user?.email ?? '';
    if (!flwKey || !email) {
      window.open(whatsappLink(`${lang === 'fr' ? 'Bonjour, je souhaite passer au plan' : 'Hello, I would like to upgrade to the'} Synthia ${plan.name} (${email}).`), '_blank');
      return;
    }
    const pay = () => window.FlutterwaveCheckout?.({
      public_key: flwKey,
      tx_ref: `SYNTHIA-${Date.now()}`,
      amount: PLAN_PRICES[plan.id as keyof typeof PLAN_PRICES][currency],
      currency,
      payment_options: 'card,mobilemoney,ussd',
      customer: { email, name: session?.user?.name ?? '' },
      customizations: { title: 'Synthia AI', description: `Synthia ${plan.name}`, logo: '/icon-192.png' },
      meta: { plan: plan.id },
      callback: () => { window.location.href = `/${lang}/dashboard/account?payment=success`; },
    });
    if (window.FlutterwaveCheckout) return pay();
    const s = document.createElement('script');
    s.src = 'https://checkout.flutterwave.com/v3.js';
    s.onload = pay;
    document.body.appendChild(s);
  };

  const u = me?.usage;
  const pct = u ? (u.unlimited ? 5 : Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100))) : 0;
  const hours = me ? Math.round((me.stats.seconds / 3600) * 10) / 10 : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader title={lang === 'fr' ? 'Abonnement & usage' : 'Plan & usage'}
        subtitle={lang === 'fr' ? 'Votre consommation du mois et les plans disponibles.' : 'Your usage this month and available plans.'} />

      <div className="grid sm:grid-cols-4 gap-4 mb-10">
        <div className="glow-card rounded-3xl p-5 sm:col-span-2">
          <div className="text-xs text-slate-400">{lang === 'fr' ? 'Plan actuel' : 'Current plan'}</div>
          <div className="text-3xl font-black text-white capitalize mt-1">{u?.plan ?? '…'}</div>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {u ? (u.unlimited ? (lang === 'fr' ? 'Vidéos illimitées' : 'Unlimited videos') : `${u.used} / ${u.limit} ${lang === 'fr' ? 'vidéos ce mois-ci' : 'videos this month'}`) : ''}
          </div>
        </div>
        <div className="glow-card rounded-3xl p-5">
          <div className="text-xs text-slate-400">{lang === 'fr' ? 'Vidéos créées' : 'Videos created'}</div>
          <div className="text-3xl font-black text-white mt-1">{me?.stats.ready ?? '…'}</div>
          <div className="text-xs text-slate-500 mt-2">{hours} h {lang === 'fr' ? 'de contenu' : 'of content'}</div>
        </div>
        <div className="glow-card rounded-3xl p-5">
          <div className="text-xs text-slate-400">{lang === 'fr' ? 'Publiées / programmées' : 'Published / scheduled'}</div>
          <div className="text-3xl font-black text-white mt-1">{me ? `${me.stats.published} / ${me.stats.scheduled}` : '…'}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PLANS.map((p) => {
          const current = u?.plan === p.id;
          return (
            <div key={p.id} className={`relative rounded-3xl p-6 border flex flex-col ${p.popular ? 'border-violet-500 bg-gradient-to-b from-violet-600/20 to-transparent' : 'border-[#2A2A45] bg-[#13132A]'}`}>
              {p.popular && <span className="absolute -top-3 left-6 text-[11px] px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold">{lang === 'fr' ? 'Le plus choisi' : 'Most popular'}</span>}
              <div className="text-white font-bold text-lg">{p.name}</div>
              <div className="mt-2"><span className="text-3xl font-black text-white">{formatPrice(PLAN_PRICES[p.id as keyof typeof PLAN_PRICES].EUR, 'EUR', lang)}</span> <span className="text-slate-400 text-sm">/ {lang === 'fr' ? 'mois' : 'month'}</span></div>
              <div className="text-xs text-slate-500">{lang === 'fr' ? 'ou' : 'or'} {formatPrice(PLAN_PRICES[p.id as keyof typeof PLAN_PRICES].USD, 'USD', lang)}</div>
              <ul className="mt-5 space-y-2 text-sm text-slate-300 flex-1">
                {(lang === 'fr' ? p.fr : p.en).map((f) => <li key={f} className="flex gap-2"><span className="text-violet-400">✓</span>{f}</li>)}
              </ul>
              {current ? (
                <div className="mt-6 text-center text-sm py-3 rounded-xl border border-green-500/40 text-green-300">{lang === 'fr' ? 'Votre plan actuel' : 'Your current plan'}</div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <button onClick={() => upgrade(p, 'EUR')} className="py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-slate-200">EUR €</button>
                  <button onClick={() => upgrade(p, 'USD')} className="py-3 rounded-xl border border-[#2A2A45] text-white font-semibold text-sm hover:border-violet-500">USD $</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 mt-6 text-center">
        {lang === 'fr' ? 'Paiement en euros ou en dollars, par carte, Mobile Money ou virement. Une question ?' : 'Pay in euros or dollars, by card, Mobile Money or bank transfer. Questions?'}{' '}
        <a href={whatsappLink('Synthia AI')} target="_blank" rel="noreferrer" className="text-violet-400">WhatsApp</a> ·{' '}
        <Email className="text-violet-400" />
      </p>
    </div>
  );
}
