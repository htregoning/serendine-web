import type { MetadataRoute } from 'next';

// Lets guests add Serendine to their home screen (needed for notifications on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Serendine',
    short_name: 'Serendine',
    description: 'Say hello to another table.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B1A3A',
    theme_color: '#0B1A3A',
    icons: [{ src: '/icon.png', sizes: '220x220', type: 'image/png', purpose: 'any' }],
  };
}
