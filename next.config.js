/** @type {import('next').NextConfig} */

// Content-Security-Policy: only our own origin, plus Flutterwave's checkout for payments.
// 'unsafe-inline' scripts are required by Next.js' inline bootstrap without per-request nonces.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.flutterwave.com",
  "style-src 'self' 'unsafe-inline'",
  // Profile pictures of connected YouTube/TikTok/Instagram/Facebook/X accounts.
  "img-src 'self' data: blob: https://*.ggpht.com https://*.googleusercontent.com https://*.tiktokcdn.com https://*.tiktokcdn-us.com https://*.tiktokcdn-eu.com https://*.cdninstagram.com https://*.fbcdn.net https://platform-lookaside.fbsbx.com https://pbs.twimg.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.flutterwave.com",
  "frame-src https://checkout.flutterwave.com https://*.flutterwave.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), payment=(self "https://checkout.flutterwave.com")' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep heavy native modules server-side only (fluent-ffmpeg, googleapis, etc.)
  serverExternalPackages: [
    'fluent-ffmpeg', 'formidable', 'googleapis', 'twitter-api-v2', 'axios', 'form-data',
  ],
  // No remote images: the optimizer must not fetch arbitrary URLs for third parties.
  images: { remotePatterns: [] },
  // Uploads go through proxy.ts, which buffers the body: the default 10 MB cut every larger video upload.
  // Cloudflare caps request bodies at 100 MB anyway.
  experimental: { proxyClientMaxBodySize: '110mb' },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // API answers are private and same-origin only (no CORS headers on purpose).
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

module.exports = nextConfig;
