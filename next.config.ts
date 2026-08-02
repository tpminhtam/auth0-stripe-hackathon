import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.POSTHOG_ANALYTICS_API_KEY,
  },
  // Reverse proxy for PostHog (matches api_host in instrumentation-client.ts).
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://us-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/array/:path*', destination: 'https://us-assets.i.posthog.com/array/:path*' },
      { source: '/ingest/:path*', destination: 'https://us.i.posthog.com/:path*' },
    ];
  },
  // Dev only: Next serves dev CSS/JS chunks under STABLE filenames, so Safari
  // caches them and never revalidates — you edit a style, reload, and get the
  // old stylesheet against new markup (elements with no matching rules fall
  // into normal flow and the page looks shattered). Chrome hides this because
  // devtools/fresh profiles bypass the cache. Never ship this to prod.
  async headers() {
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }

    return [{ source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] }];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
