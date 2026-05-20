/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Keep heavy native modules server-side only (fluent-ffmpeg, googleapis, etc.)
  serverExternalPackages: [
    'fluent-ffmpeg', 'formidable', 'googleapis', 'twitter-api-v2',
    'axios', 'form-data', 'bull',
  ],
  // Acknowledge Turbopack (Next.js 16 default) — no custom config needed
  turbopack: {},
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Flutterwave-Signature, verif-hash' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
