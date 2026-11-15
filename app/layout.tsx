import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration';
import SessionProvider from './components/SessionProvider';

const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap' });

export const viewport: Viewport = {
  themeColor: '#0B0B16',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://synthia.ikelyane.com'),
  title: 'Synthia AI — Studio vidéo IA',
  description: 'Créez des vidéos virales en quelques minutes : script, voix-off, musique, sous-titres animés, montage et publication programmée.',
  applicationName: 'Synthia AI',
  keywords: ['IA', 'contenu viral', 'TikTok', 'YouTube Shorts', 'clonage voix', 'montage automatique'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Synthia AI',
  },
  openGraph: {
    title: 'Synthia AI',
    description: 'Vos vidéos virales, écrites, doublées et montées par l\'IA.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={inter.className}>
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
