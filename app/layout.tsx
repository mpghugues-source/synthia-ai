import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Synthia AI — Studio de Contenu IA',
  description: 'Créez scripts, voix-off clonées, musique et vidéos virales en quelques clics. 100% open-source & local.',
  keywords: ['IA', 'contenu viral', 'TikTok', 'YouTube Shorts', 'clonage voix', 'montage automatique'],
  openGraph: {
    title: 'Synthia AI',
    description: 'Studio de création de contenu viral propulsé par l\'IA locale.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#0F0F1A" />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
