import type { MetadataRoute } from 'next';

// Lets guests add Serendine to their home screen (needed for notifications on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Serendine',
    short_name: 'Serendine',
    description: 'Say hello to another table.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B1A3A',
    theme_color: '#0B1A3A',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
