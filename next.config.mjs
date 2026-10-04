/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // No other site may frame Serendine, except Telegram (for the mini app on Telegram Web).
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" },
        ],
      },
    ];
  },
};

export default nextConfig;
