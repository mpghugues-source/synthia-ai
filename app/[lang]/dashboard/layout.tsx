import Shell from '@/components/dashboard/Shell';

export default async function DashboardLayout({
  children, params,
}: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <Shell lang={lang === 'en' ? 'en' : 'fr'}>{children}</Shell>;
}
