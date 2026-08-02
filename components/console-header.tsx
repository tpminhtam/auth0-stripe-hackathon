'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand-mark';

const NAV = [
  { href: '/request', label: 'Lens' },
  { href: '/approvals', label: 'Checkout' },
  { href: '/checkout', label: 'Plans' },
];

/** Slim in-app bar for /request and /approvals — brand, page title, nav pills. */
export function ConsoleHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="anim-rise-sm mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3.5">
        <Link href="/" aria-label="Loupe home" className="group">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/4 transition-colors duration-300 group-hover:border-beam/40">
            <BrandMark className="h-[22px] w-[22px] transition-transform duration-500 ease-out group-hover:rotate-90" />
          </span>
        </Link>
        <div>
          <p className="eyebrow text-dim">{eyebrow}</p>
          <h1 className="mt-0.5 text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {right}
        <nav className="flex items-center gap-0.5 rounded-xl border border-white/8 bg-white/3 p-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                  active ? 'bg-white/10 text-ink' : 'text-dim hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
