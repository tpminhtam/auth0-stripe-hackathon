import localFont from 'next/font/local';

// Self-hosted on purpose: `next/font/google` fetches at build time, and a
// gameday-morning build must never depend on the venue network.
export const sans = localFont({
  src: './fonts/inter.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: true,
});

export const mono = localFont({
  src: './fonts/jbmono.woff2',
  variable: '--font-jbmono',
  weight: '100 800',
  display: 'swap',
  preload: true,
});
