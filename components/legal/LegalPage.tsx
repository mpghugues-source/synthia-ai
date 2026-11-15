import Email from '@/components/Email';

export interface Section { h: string; p: (string | { list: string[] })[] }

/** Shared layout for the public legal pages (privacy policy, terms of service). */
export default function LegalPage({ lang, title, updated, intro, sections }: {
  lang: 'fr' | 'en'; title: string; updated: string; intro: string; sections: Section[];
}) {
  const linkify = (t: string) => t.split(/(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+\b)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="text-violet-400 break-all">{part}</a>
      : /@/.test(part) && /^[\w.+-]+@/.test(part) ? <Email key={i} address={part} /> : part);
  return (
    <main className="min-h-screen bg-[#0B0B16] text-slate-300 px-4 sm:px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <a href={`/${lang}`} className="inline-flex items-center gap-2 mb-10">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white font-black text-sm">S</span>
          <span className="font-bold text-white">Synthia AI</span>
        </a>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">{title}</h1>
        <p className="text-sm text-slate-500 mb-8">{updated}</p>
        <p className="leading-relaxed mb-8">{linkify(intro)}</p>
        {sections.map((s) => (
          <section key={s.h} className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">{s.h}</h2>
            {s.p.map((x, i) => typeof x === 'string'
              ? <p key={i} className="leading-relaxed mb-3">{linkify(x)}</p>
              : <ul key={i} className="list-disc pl-6 space-y-1.5 mb-3">{x.list.map((li) => <li key={li}>{linkify(li)}</li>)}</ul>)}
          </section>
        ))}
        <p className="text-sm text-slate-500 border-t border-white/10 pt-6 mt-10">
          Contact : <Email /> ·{' '}
          <a href={`/${lang}/privacy`} className="text-violet-400">{lang === 'fr' ? 'Confidentialité' : 'Privacy'}</a> ·{' '}
          <a href={`/${lang}/terms`} className="text-violet-400">{lang === 'fr' ? 'Conditions' : 'Terms'}</a>
        </p>
      </div>
    </main>
  );
}
