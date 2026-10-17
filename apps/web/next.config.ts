import type { NextConfig } from 'next';
import path from 'node:path';
const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@yehabibi/shared', '@yehabibi/api-client'],
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  turbopack: { root: path.resolve(process.cwd(), '../..') },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/order/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex' }] }
    ];
  }
};
export default nextConfig;
