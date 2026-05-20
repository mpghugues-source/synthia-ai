'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { Metadata } from 'next';

// Load translations
import fr from '@/i18n/fr.json';
import en from '@/i18n/en.json';

type Lang = 'fr' | 'en';
type Translations = typeof fr;

const TRANSLATIONS: Record<Lang, Translations> = { fr, en };

declare global {
  interface Window {
    FlutterwaveCheckout: (config: Record<string, unknown>) => void;
  }
}

// ── Flutterwave modal ─────────────────────────────────────────────────────────

function openFlutterwaveModal(opts: {
  amount: number;
  currency: string;
  planName: string;
  lang: Lang;
}) {
  const script = document.createElement('script');
  script.src = 'https://checkout.flutterwave.com/v3.js';
  script.onload = () => {
    window.FlutterwaveCheckout({
      public_key: process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '',
      tx_ref: `SYNTHIA-${Date.now()}`,
      amount: opts.amount,
      currency: opts.currency,
      payment_options: 'card,mobilemoneyrwanda,mobilemoneyghana,mpesa,ussd',
      customer: { email: '', phonenumber: '', name: '' },
      customizations: {
        title: 'Synthia AI',
        description: `${opts.lang === 'fr' ? 'Abonnement' : 'Subscription'} ${opts.planName}`,
        logo: '/logo.png',
      },
      meta: { plan: opts.planName.toLowerCase() },
      callback: (response: { status: string }) => {
        if (response.status === 'successful') {
          window.location.href = `/${opts.lang}/dashboard?payment=success`;
        }
      },
      onclose: () => {},
    });
  };
  document.body.appendChild(script);
}

// ── Components ────────────────────────────────────────────────────────────────

function Navbar({ t, lang }: { t: Translations; lang: Lang }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
      scrolled ? 'bg-[#0F0F1A]/95 backdrop-blur border-b border-[#2A2A45]' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
            S
          </div>
          <span className="font-bold text-xl text-white">Synthia AI</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">{t.nav.features}</a>
          <a href="#pricing"  className="hover:text-white transition-colors">{t.nav.pricing}</a>
          <a href={`/${lang}/dashboard`} className="hover:text-white transition-colors">{t.nav.dashboard}</a>
        </div>

        <div className="flex items-center gap-3">
          <a href={`/${lang}/dashboard`}
            className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors">
            {t.nav.login}
          </a>
          <a href="#pricing"
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
            {t.nav.start}
          </a>
          {/* Language switcher */}
          <a href={lang === 'fr' ? '/en' : '/fr'}
            className="text-xs px-2 py-1 rounded border border-[#2A2A45] text-slate-400 hover:border-violet-500 hover:text-white transition-all">
            {lang === 'fr' ? 'EN' : 'FR'}
          </a>
        </div>
      </div>
    </nav>
  );
}

function Hero({ t, lang }: { t: Translations; lang: Lang }) {
  return (
    <section className="hero-gradient min-h-screen flex items-center justify-center relative overflow-hidden pt-20">
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-10"
        style={{ backgroundImage: 'linear-gradient(rgba(124,58,237,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,.3) 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-600/15 rounded-full blur-3xl" />

      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 text-sm mb-8">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          {t.hero.badge}
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-tight mb-6 text-white">
          {t.hero.title}
          <br />
          <span className="text-gradient">{t.hero.titleAccent}</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          {t.hero.subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a href={`/${lang}/dashboard`}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold text-lg hover:opacity-90 transition-all shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:-translate-y-0.5">
            {t.hero.cta}
          </a>
          <a href="#features"
            className="px-8 py-4 rounded-xl border border-[#2A2A45] text-slate-300 font-semibold text-lg hover:border-violet-500 hover:text-white transition-all">
            {t.hero.ctaSecondary}
          </a>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-12">
          {t.hero.stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black text-gradient">{s.value}</div>
              <div className="text-sm text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Platform logos */}
        <div className="flex items-center justify-center gap-6 mt-14 opacity-40">
          {['YouTube', 'TikTok', 'Instagram', 'Facebook', 'X'].map((p) => (
            <span key={p} className="text-xs font-bold text-slate-400 tracking-widest uppercase">{p}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features({ t }: { t: Translations }) {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.features.title}</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">{t.features.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {t.features.items.map((f, i) => (
            <div key={i} className="glow-card rounded-2xl p-6">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface PricingPlan {
  name: string;
  priceXOF: string;
  priceUSD: string;
  period: string;
  desc: string;
  popular?: boolean;
  features: string[];
}

function Pricing({ t, lang }: { t: Translations; lang: Lang }) {
  const [currency, setCurrency] = useState<'XOF' | 'USD'>('XOF');
  const amounts: Record<string, Record<'XOF' | 'USD', number>> = {
    Starter: { XOF: 9900,  USD: 15 },
    Creator: { XOF: 24900, USD: 39 },
    Studio:  { XOF: 49900, USD: 79 },
  };

  return (
    <section id="pricing" className="py-24 px-6 bg-[#0B0B18]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">{t.pricing.title}</h2>
          <p className="text-slate-400 text-lg mb-8">{t.pricing.subtitle}</p>

          {/* Currency toggle */}
          <div className="inline-flex rounded-lg border border-[#2A2A45] p-1 gap-1">
            {(['XOF', 'USD'] as const).map((c) => (
              <button key={c}
                onClick={() => setCurrency(c)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  currency === c
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}>
                {c === 'XOF' ? 'FCFA' : 'USD $'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(t.pricing.plans as PricingPlan[]).map((plan) => (
            <div key={plan.name}
              className={`glow-card rounded-2xl p-8 flex flex-col relative ${
                plan.popular ? 'border-violet-500 shadow-xl shadow-violet-500/20' : ''
              }`}>
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-violet-600 to-pink-600 text-white text-xs font-bold whitespace-nowrap">
                  {t.pricing.popular}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                <p className="text-slate-500 text-sm">{plan.desc}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black text-white">
                    {currency === 'XOF' ? plan.priceXOF : `$${plan.priceUSD}`}
                  </span>
                  <span className="text-slate-500 mb-1">
                    {currency === 'XOF' ? ' FCFA' : ''}{plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="text-violet-400 mt-0.5 flex-shrink-0">✓</span>
                    {feat}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => openFlutterwaveModal({
                  amount: amounts[plan.name][currency],
                  currency,
                  planName: plan.name,
                  lang,
                })}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white hover:opacity-90 shadow-lg shadow-violet-500/30'
                    : 'border border-[#2A2A45] text-slate-300 hover:border-violet-500 hover:text-white'
                }`}>
                {t.pricing.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-600 text-sm mt-10">{t.pricing.payment_methods}</p>
      </div>
    </section>
  );
}

function Footer({ t, lang }: { t: Translations; lang: Lang }) {
  return (
    <footer className="border-t border-[#2A2A45] py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">S</div>
          <span className="text-sm text-slate-500">{t.footer.tagline}</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-500">
          <a href="#" className="hover:text-white transition-colors">{t.footer.links.legal}</a>
          <a href="#" className="hover:text-white transition-colors">{t.footer.links.privacy}</a>
          <a href="#" className="hover:text-white transition-colors">{t.footer.links.terms}</a>
          <a href="#" className="hover:text-white transition-colors">{t.footer.links.contact}</a>
        </div>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const params  = useParams();
  const rawLang = Array.isArray(params?.lang) ? params.lang[0] : (params?.lang ?? 'fr');
  const lang    = (rawLang === 'en' ? 'en' : 'fr') as Lang;
  const t       = TRANSLATIONS[lang];

  return (
    <main>
      <Navbar t={t} lang={lang} />
      <Hero   t={t} lang={lang} />
      <Features t={t} />
      <Pricing  t={t} lang={lang} />
      <Footer   t={t} lang={lang} />
    </main>
  );
}
