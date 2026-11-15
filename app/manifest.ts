import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Synthia AI — Studio vidéo IA',
    short_name: 'Synthia',
    description: 'Créez des vidéos virales en quelques minutes : script, voix, musique, sous-titres, montage et publication.',
    start_url: '/dashboard?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#0B0B16',
    theme_color: '#0B0B16',
    lang: 'fr',
    categories: ['productivity', 'video', 'social'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Studio', url: '/dashboard', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Viral Lab', url: '/dashboard/viral', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Bibliothèque', url: '/dashboard/library', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Calendrier', url: '/dashboard/calendar', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
