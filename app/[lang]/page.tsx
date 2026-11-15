'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { whatsappLink } from '@/lib/contact';
import Email from '@/components/Email';
import { PLAN_PRICES, formatPrice, type Currency } from '@/lib/pricing';

type Lang = 'fr' | 'en';

const T = {
  fr: {
    nav: { how: 'Comment ça marche', features: 'Fonctionnalités', uses: 'Pour qui ?', pricing: 'Tarifs', faq: 'FAQ', login: 'Connexion', start: 'Essai gratuit' },
    badge: 'Nouveau : Viral Lab, publication programmée & Brand kit',
    h1a: 'Vos vidéos virales,', h1b: 'écrites, doublées et montées par l’IA.',
    sub: 'Tapez un sujet. Synthia écrit le script, le fait lire par une voix naturelle, ajoute musique et sous-titres animés, monte la vidéo et la programme sur TikTok, Reels, Shorts, Facebook et X.',
    cta: 'Créer ma première vidéo', cta2: 'Voir comment ça marche', ctaNote: '3 vidéos offertes chaque mois · sans carte bancaire',
    stats: [['8', 'langues de script'], ['5', 'réseaux sociaux'], ['< 5 min', 'du sujet à la vidéo']],
    howTitle: 'Du sujet à la vidéo publiée, en 3 étapes',
    how: [
      ['💡', 'Choisissez un sujet', 'Un modèle, une tendance du moment ou une idée du Viral Lab. L’IA propose l’accroche qui arrête le scroll.'],
      ['🎬', 'Synthia produit tout', 'Script optimisé, voix-off naturelle, musique, sous-titres stylés, images et montage au bon format.'],
      ['🚀', 'Publiez ou programmez', 'Téléchargez, ou programmez la publication sur vos réseaux au meilleur horaire.'],
    ],
    featTitle: 'Tout un studio de contenu, dans un seul outil',
    featSub: 'Remplacez rédacteur, voix-off, monteur et community manager par un seul abonnement.',
    feats: [
      ['✍️', 'Scripts qui retiennent', 'Accroche, valeur, appel à l’action : la structure des vidéos qui performent, en 8 langues.', 'lg'],
      ['🎙️', 'Voix ultra-réalistes', 'Des dizaines de voix premium, ou votre propre voix clonée.', ''],
      ['💬', 'Sous-titres animés', '4 styles (dont « viral » jaune), synchronisés mot à mot.', ''],
      ['🚀', 'Viral Lab', '10 accroches notées, titres A/B, textes pour chaque réseau, plan de 14 jours, hashtags & horaires.', 'lg'],
      ['🗓️', 'Calendrier & auto-publication', 'Programmez une semaine de contenu en 10 minutes.', ''],
      ['🎨', 'Brand kit', 'Filigrane, ton de marque, langue et voix par défaut appliqués partout.', ''],
      ['📖', 'Narrations longues', 'Un chapitre, un cours, un sermon : transformé en vidéo narrée sous-titrée.', ''],
      ['🌍', 'Traduction en 1 clic', 'Déclinez chaque vidéo pour de nouveaux marchés.', ''],
    ],
    usesTitle: 'Pensé pour celles et ceux qui doivent publier souvent',
    uses: [
      ['🎥', 'Créateurs', 'Publiez chaque jour sans vous épuiser.'],
      ['🏪', 'Commerces & PME', 'Présentez vos produits et promotions en vidéo.'],
      ['⛪', 'Églises & ministères', 'Méditations, lectures bibliques et annonces.'],
      ['🎓', 'Formateurs & écoles', 'Transformez vos cours en capsules vidéo.'],
      ['📰', 'Médias', 'Résumés d’actualité en format court.'],
      ['🧑‍💼', 'Agences', 'Produisez pour plusieurs clients, à la chaîne.'],
    ],
    beforeAfter: { title: 'Le même résultat, sans l’équipe', before: 'Sans Synthia', after: 'Avec Synthia',
      rows: [['Écrire un script', '1 h', '10 s'], ['Enregistrer la voix-off', '45 min', '30 s'], ['Monter + sous-titrer', '2 h', '2–4 min'], ['Rédiger les textes pour 5 réseaux', '40 min', '10 s'], ['Publier au bon moment', 'Manuel', 'Automatique']] },
    pricingTitle: 'Des tarifs simples, en euros ou en dollars',
    pricingSub: 'Carte bancaire, Mobile Money ou virement. Sans engagement, résiliable à tout moment.',
    month: '/ mois', popular: 'Le plus choisi', choose: 'Choisir', free: 'Commencer gratuitement',
    plans: [
      { id: 'free', name: 'Gratuit', desc: 'Pour découvrir', f: ['3 vidéos / mois', 'Scripts IA & voix premium', 'Sous-titres animés', 'Viral Lab'] },
      { id: 'starter', name: 'Starter', desc: 'Pour démarrer sérieusement', f: ['10 vidéos / mois', '8 langues', 'Brand kit & filigrane', 'Textes pour chaque réseau'] },
      { id: 'creator', name: 'Creator', desc: 'Pour publier tous les jours', popular: true, f: ['50 vidéos / mois', 'Calendrier & auto-publication', 'Narrations longues', 'Images IA', 'Support prioritaire'] },
      { id: 'studio', name: 'Studio', desc: 'Pour les équipes et agences', f: ['Vidéos illimitées', 'Multi-comptes sociaux', 'Accès API', 'Accompagnement dédié'] },
    ],
    faqTitle: 'Questions fréquentes',
    faq: [
      ['Faut-il savoir monter des vidéos ?', 'Non. Vous donnez un sujet (ou votre texte), Synthia s’occupe du script, de la voix, de la musique, des sous-titres et du montage.'],
      ['Dans quelles langues ?', 'Français, anglais, espagnol, portugais, swahili, allemand, italien et arabe pour les scripts ; la traduction se fait en un clic depuis le Viral Lab.'],
      ['Puis-je utiliser ma propre voix ?', 'Oui : importez votre voix-off en mode Manuel, ou utilisez un identifiant de voix clonée ElevenLabs.'],
      ['Les vidéos m’appartiennent-elles ?', 'Oui. Vous pouvez les télécharger et les publier où vous voulez, y compris à des fins commerciales.'],
      ['Comment payer ?', 'En euros ou en dollars, par carte bancaire ou Mobile Money. Écrivez-nous sur WhatsApp si vous préférez un virement.'],
      ['Puis-je arrêter quand je veux ?', 'Oui, sans engagement. Le plan gratuit reste disponible.'],
    ],
    finalTitle: 'Votre prochaine vidéo est à 5 minutes.', finalCta: 'Commencer gratuitement',
    footer: 'Synthia AI — un produit Ikelyane.', contact: 'Contact',
    mock: { hook: 'Accroche 9/10', sched: 'Programmée · mar. 18:00', langs: '8 langues', cap: 'Personne ne vous dit ça…' },
  },
  en: {
    nav: { how: 'How it works', features: 'Features', uses: 'Who it’s for', pricing: 'Pricing', faq: 'FAQ', login: 'Log in', start: 'Free trial' },
    badge: 'New: Viral Lab, scheduled publishing & Brand kit',
    h1a: 'Viral videos,', h1b: 'written, voiced and edited by AI.',
    sub: 'Type a topic. Synthia writes the script, has it read by a natural voice, adds music and animated captions, edits the video and schedules it on TikTok, Reels, Shorts, Facebook and X.',
    cta: 'Create my first video', cta2: 'See how it works', ctaNote: '3 free videos every month · no credit card',
    stats: [['8', 'languages'], ['5', 'social networks'], ['< 5 min', 'from topic to video']],
    howTitle: 'From topic to published video in 3 steps',
    how: [
      ['💡', 'Pick a topic', 'A template, a current trend or a Viral Lab idea. The AI suggests the hook that stops the scroll.'],
      ['🎬', 'Synthia makes it all', 'Optimised script, natural voice-over, music, styled captions, images and editing in the right format.'],
      ['🚀', 'Publish or schedule', 'Download it, or schedule it on your networks at the best time.'],
    ],
    featTitle: 'A whole content studio in one tool',
    featSub: 'Replace copywriter, voice-over artist, editor and social media manager with one subscription.',
    feats: [
      ['✍️', 'Scripts that retain', 'Hook, value, call to action: the structure of videos that perform, in 8 languages.', 'lg'],
      ['🎙️', 'Ultra-realistic voices', 'Dozens of premium voices, or your own cloned voice.', ''],
      ['💬', 'Animated captions', '4 styles (including yellow “viral”), synced word by word.', ''],
      ['🚀', 'Viral Lab', '10 scored hooks, A/B titles, copy for every network, 14-day plan, hashtags & timing.', 'lg'],
      ['🗓️', 'Calendar & auto-publishing', 'Schedule a week of content in 10 minutes.', ''],
      ['🎨', 'Brand kit', 'Watermark, brand tone, default language and voice applied everywhere.', ''],
      ['📖', 'Long narrations', 'A chapter, a course, a sermon: turned into a captioned narrated video.', ''],
      ['🌍', 'One-click translation', 'Localise every video for new markets.', ''],
    ],
    usesTitle: 'Built for people who need to post often',
    uses: [
      ['🎥', 'Creators', 'Post daily without burning out.'],
      ['🏪', 'Shops & SMEs', 'Show your products and offers in video.'],
      ['⛪', 'Churches & ministries', 'Devotionals, Bible readings and announcements.'],
      ['🎓', 'Trainers & schools', 'Turn lessons into video capsules.'],
      ['📰', 'Media', 'Short-form news recaps.'],
      ['🧑‍💼', 'Agencies', 'Produce for many clients at scale.'],
    ],
    beforeAfter: { title: 'The same result, without the team', before: 'Without Synthia', after: 'With Synthia',
      rows: [['Write a script', '1 h', '10 s'], ['Record the voice-over', '45 min', '30 s'], ['Edit + caption', '2 h', '2–4 min'], ['Write copy for 5 networks', '40 min', '10 s'], ['Post at the right time', 'Manual', 'Automatic']] },
    pricingTitle: 'Simple pricing, in euros or dollars',
    pricingSub: 'Card, Mobile Money or bank transfer. No commitment, cancel anytime.',
    month: '/ month', popular: 'Most popular', choose: 'Choose', free: 'Start for free',
    plans: [
      { id: 'free', name: 'Free', desc: 'To try it out', f: ['3 videos / month', 'AI scripts & premium voices', 'Animated captions', 'Viral Lab'] },
      { id: 'starter', name: 'Starter', desc: 'To get serious', f: ['10 videos / month', '8 languages', 'Brand kit & watermark', 'Copy for every network'] },
      { id: 'creator', name: 'Creator', desc: 'To post every day', popular: true, f: ['50 videos / month', 'Calendar & auto-publishing', 'Long narrations', 'AI images', 'Priority support'] },
      { id: 'studio', name: 'Studio', desc: 'For teams and agencies', f: ['Unlimited videos', 'Multiple social accounts', 'API access', 'Dedicated onboarding'] },
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      ['Do I need editing skills?', 'No. Give a topic (or your text) and Synthia handles the script, voice, music, captions and editing.'],
      ['Which languages?', 'French, English, Spanish, Portuguese, Swahili, German, Italian and Arabic for scripts; translation is one click away in the Viral Lab.'],
      ['Can I use my own voice?', 'Yes: upload your voice-over in Manual mode, or use a cloned ElevenLabs voice ID.'],
      ['Do I own the videos?', 'Yes. Download them and publish them anywhere, including for commercial use.'],
      ['How do I pay?', 'In euros or dollars, by card or Mobile Money. Message us on WhatsApp if you prefer a bank transfer.'],
      ['Can I stop anytime?', 'Yes, no commitment. The free plan stays available.'],
    ],
    finalTitle: 'Your next video is 5 minutes away.', finalCta: 'Start for free',
    footer: 'Synthia AI — an Ikelyane product.', contact: 'Contact',
    mock: { hook: 'Hook 9/10', sched: 'Scheduled · Tue 6 PM', langs: '8 languages', cap: 'Nobody tells you this…' },
  },
};

type Dict = typeof T.fr;

function Navbar({ t, lang }: { t: Dict; lang: Lang }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#0B0B16]/90 backdrop-blur border-b border-white/5' : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href={`/${lang}`} className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-black shadow-lg shadow-violet-900/50">S</span>
          <span className="font-bold text-lg text-white tracking-tight">Synthia <span className="text-gradient">AI</span></span>
        </a>
        <div className="hidden lg:flex items-center gap-7 text-sm text-slate-400">
          <a href="#how" className="hover:text-white">{t.nav.how}</a>
          <a href="#features" className="hover:text-white">{t.nav.features}</a>
          <a href="#uses" className="hover:text-white">{t.nav.uses}</a>
          <a href="#pricing" className="hover:text-white">{t.nav.pricing}</a>
          <a href="#faq" className="hover:text-white">{t.nav.faq}</a>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href={`/${lang === 'fr' ? 'en' : 'fr'}`} className="text-xs px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-white">{lang === 'fr' ? 'EN' : 'FR'}</a>
          <a href={`/${lang}/login`} className="hidden sm:block text-sm text-slate-300 hover:text-white">{t.nav.login}</a>
          <a href={`/${lang}/register`} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-slate-200">{t.nav.start}</a>
        </div>
      </div>
    </nav>
  );
}

function PhoneMock({ t }: { t: Dict }) {
  return (
    <div className="relative mx-auto w-[250px] sm:w-[280px]">
      <div className="absolute -inset-10 bg-gradient-to-tr from-violet-600/40 to-pink-500/30 blur-3xl rounded-full" />
      <div className="relative aspect-[9/19] rounded-[2.5rem] border-[6px] border-[#1c1c30] bg-[#0b0b16] shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#7c3aed_0%,_#312e81_40%,_#0b0b16_85%)]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-30" />
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black/80" />
        <span className="absolute top-12 right-3 text-[10px] font-bold text-white/90 bg-black/40 px-1.5 py-0.5 rounded">@synthia</span>
        <div className="absolute inset-x-0 top-[38%] flex justify-center">
          <span className="w-16 h-16 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white text-2xl animate-pulse-slow">▶</span>
        </div>
        <div className="absolute inset-x-0 bottom-[22%] text-center px-4">
          <span className="text-yellow-300 font-black text-lg [text-shadow:0_3px_0_#000,0_0_8px_#000]">{t.mock.cap}</span>
        </div>
        <div className="absolute right-2 bottom-24 flex flex-col gap-3 text-white/90 text-lg">
          <span>♥</span><span>💬</span><span>↗</span>
        </div>
      </div>
      <div className="absolute -left-16 sm:-left-24 top-16 animate-float rounded-2xl bg-[#16162A]/95 border border-white/10 px-3 py-2 shadow-xl text-xs text-white">🪝 {t.mock.hook}</div>
      <div className="absolute -right-12 sm:-right-24 top-1/2 animate-float [animation-delay:1.5s] rounded-2xl bg-[#16162A]/95 border border-white/10 px-3 py-2 shadow-xl text-xs text-white">🗓️ {t.mock.sched}</div>
      <div className="absolute -left-10 sm:-left-20 bottom-16 animate-float [animation-delay:3s] rounded-2xl bg-[#16162A]/95 border border-white/10 px-3 py-2 shadow-xl text-xs text-white">🌍 {t.mock.langs}</div>
    </div>
  );
}

export default function LandingPage() {
  const params = useParams();
  const lang: Lang = params?.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const [currency, setCurrency] = useState<Currency>('EUR');

  return (
    <main className="bg-[#0B0B16] text-slate-200 overflow-x-hidden">
      <Navbar t={t} lang={lang} />

      {/* Hero */}
      <section className="relative pt-28 sm:pt-36 pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-violet-600/25 rounded-full blur-3xl" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-pink-600/20 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1.15fr_1fr] gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-200 text-xs sm:text-sm mb-6">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />{t.badge}
            </div>
            <h1 className="text-4xl sm:text-6xl xl:text-7xl font-black leading-[1.05] text-white tracking-tight">
              {t.h1a}<br /><span className="text-gradient">{t.h1b}</span>
            </h1>
            <p className="text-base sm:text-lg text-slate-400 mt-6 max-w-xl mx-auto lg:mx-0 leading-relaxed">{t.sub}</p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8 justify-center lg:justify-start">
              <a href={`/${lang}/register`} className="px-7 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold text-base shadow-lg shadow-violet-600/30 hover:-translate-y-0.5 transition-all">{t.cta} →</a>
              <a href="#how" className="px-7 py-4 rounded-2xl border border-white/10 text-slate-200 font-semibold hover:border-violet-500">{t.cta2}</a>
            </div>
            <p className="text-xs text-slate-500 mt-3">{t.ctaNote}</p>
            <div className="flex justify-center lg:justify-start gap-8 sm:gap-12 mt-10">
              {t.stats.map(([v, l]) => (
                <div key={l}><div className="text-2xl sm:text-3xl font-black text-gradient">{v}</div><div className="text-xs text-slate-500 mt-1 max-w-[9rem]">{l}</div></div>
              ))}
            </div>
          </div>
          <PhoneMock t={t} />
        </div>
        <div className="relative max-w-4xl mx-auto mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-50">
          {['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook', 'X'].map((p) => (
            <span key={p} className="text-sm font-bold text-slate-400 tracking-widest uppercase">{p}</span>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-white text-center mb-14">{t.howTitle}</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {t.how.map(([icon, title, desc], i) => (
              <div key={title} className="relative rounded-3xl p-7 border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
                <span className="absolute top-6 right-6 text-5xl font-black text-white/5">{i + 1}</span>
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features bento */}
      <section id="features" className="py-20 sm:py-24 px-4 sm:px-6 bg-[#0E0E1C]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">{t.featTitle}</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">{t.featSub}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.feats.map(([icon, title, desc, size]) => (
              <div key={title} className={`glow-card rounded-3xl p-6 ${size === 'lg' ? 'lg:col-span-2 bg-gradient-to-br from-violet-600/15 to-pink-600/5' : ''}`}>
                <div className="text-3xl mb-3">{icon}</div>
                <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before / after */}
      <section className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-10">{t.beforeAfter.title}</h2>
          <div className="rounded-3xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1.6fr_1fr_1fr] text-xs sm:text-sm font-semibold bg-white/5">
              <div className="p-4" /><div className="p-4 text-slate-400">{t.beforeAfter.before}</div><div className="p-4 text-violet-300">{t.beforeAfter.after}</div>
            </div>
            {t.beforeAfter.rows.map(([task, a, b]) => (
              <div key={task} className="grid grid-cols-[1.6fr_1fr_1fr] text-sm border-t border-white/5">
                <div className="p-4 text-slate-200">{task}</div><div className="p-4 text-slate-500 line-through">{a}</div><div className="p-4 text-green-300 font-semibold">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="uses" className="py-20 sm:py-24 px-4 sm:px-6 bg-[#0E0E1C]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black text-white text-center mb-14">{t.usesTitle}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {t.uses.map(([icon, title, desc]) => (
              <div key={title} className="rounded-3xl p-6 border border-white/10 hover:border-violet-500/50 transition-colors">
                <div className="text-3xl mb-3">{icon}</div>
                <div className="text-white font-bold">{title}</div>
                <div className="text-slate-400 text-sm mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-5xl font-black text-white mb-4">{t.pricingTitle}</h2>
            <p className="text-slate-400 mb-8">{t.pricingSub}</p>
            <div className="inline-flex rounded-xl border border-white/10 p-1 gap-1">
              {(['EUR', 'USD'] as const).map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${currency === c ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>{c === 'EUR' ? 'EUR €' : 'USD $'}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.plans.map((p) => (
              <div key={p.id} className={`relative rounded-3xl p-6 flex flex-col border ${p.popular ? 'border-violet-500 bg-gradient-to-b from-violet-600/20 to-transparent shadow-xl shadow-violet-900/30' : 'border-white/10 bg-white/[0.02]'}`}>
                {p.popular && <span className="absolute -top-3 left-6 text-[11px] px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-pink-600 text-white font-semibold">{t.popular}</span>}
                <div className="text-white font-bold text-lg">{p.name}</div>
                <div className="text-slate-500 text-sm">{p.desc}</div>
                <div className="mt-5 mb-6">
                  <span className="text-4xl font-black text-white">{formatPrice(p.id === 'free' ? 0 : PLAN_PRICES[p.id as keyof typeof PLAN_PRICES][currency], currency, lang)}</span>
                  <span className="text-slate-500 text-sm"> {t.month}</span>
                </div>
                <ul className="space-y-2.5 text-sm text-slate-300 flex-1">
                  {p.f.map((f) => <li key={f} className="flex gap-2"><span className="text-violet-400">✓</span>{f}</li>)}
                </ul>
                <a href={p.id === 'free' ? `/${lang}/register` : `/${lang}/register?plan=${p.id}`}
                  className={`mt-6 text-center py-3 rounded-xl font-semibold text-sm ${p.popular ? 'bg-gradient-to-r from-violet-600 to-pink-600 text-white' : 'border border-white/10 text-white hover:border-violet-500'}`}>
                  {p.id === 'free' ? t.free : t.choose}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 sm:py-24 px-4 sm:px-6 bg-[#0E0E1C]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-10">{t.faqTitle}</h2>
          <div className="space-y-3">
            {t.faq.map(([q, a]) => (
              <details key={q} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 open:border-violet-500/40">
                <summary className="cursor-pointer list-none flex items-center justify-between text-white font-semibold">
                  {q}<span className="text-violet-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                </summary>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto rounded-[2rem] p-10 sm:p-14 text-center bg-gradient-to-br from-violet-600 to-pink-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-30" />
          <h2 className="relative text-3xl sm:text-5xl font-black text-white mb-6">{t.finalTitle}</h2>
          <a href={`/${lang}/register`} className="relative inline-block px-8 py-4 rounded-2xl bg-white text-black font-bold hover:bg-slate-100">{t.finalCta} →</a>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">S</span>
            {t.footer}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a href={whatsappLink('Synthia AI')} target="_blank" rel="noreferrer" className="hover:text-white">WhatsApp</a>
            <Email className="hover:text-white" />
            <a href="https://ikelyane.com" className="hover:text-white">ikelyane.com</a>
            <a href={`/${lang}/privacy`} className="hover:text-white">{lang === 'fr' ? 'Confidentialité' : 'Privacy'}</a>
            <a href={`/${lang}/terms`} className="hover:text-white">{lang === 'fr' ? 'Conditions' : 'Terms'}</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
