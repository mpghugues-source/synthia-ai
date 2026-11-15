import { redirect } from 'next/navigation';

/** The old global history became the per-user Library. */
export default async function HistoryRedirect({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  redirect(`/${lang === 'en' ? 'en' : 'fr'}/dashboard/library`);
}
