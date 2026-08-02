import type { Metadata } from 'next';
import { AuthSync } from '@/components/auth-sync';
import { mono, sans } from '@/app/fonts';

import './globals.css';

export const metadata: Metadata = {
  title: 'Loupe — see it, ask, bought',
  description:
    'The shopping agent that sees what you see. Point it at anything you want and it identifies the item, reads the live market to tell you what it is really worth and whether to wait for a sale, then sends it to checkout for a human to complete.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  icons: {
    icon: '/favicons/favicon.svg',
    apple: '/favicons/favicon.svg',
  },
  openGraph: {
    images: ['/opengraph/default.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/opengraph/default.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const bodyClassName =
    'font-sans relative isolate min-h-screen overflow-x-hidden bg-void text-ink antialiased';

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className={bodyClassName}>
        {/* Ambient layers sit behind everything on every page. */}
        <div className="aurora" aria-hidden>
          <span />
        </div>
        <div className="grain" aria-hidden />
        <AuthSync />
        {children}
      </body>
    </html>
  );
}
