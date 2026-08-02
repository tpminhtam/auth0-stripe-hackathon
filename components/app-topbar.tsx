import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { appConfig } from '@/lib/app-config';
import { loginHref } from '@/lib/wallets';

const NAV = [
  { href: '/request', label: 'Lens' },
  { href: '/approvals', label: 'Checkout' },
  { href: '/checkout', label: 'Pricing' },
];

export function AppTopbar({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      <div className="mt-3 flex h-14 w-full max-w-6xl items-center justify-between rounded-2xl border border-white/8 bg-void/60 px-3 pl-4 backdrop-blur-xl sm:px-4 sm:pl-5">
        <div className="flex items-center gap-3">
          <Link className="group flex items-center gap-2.5 whitespace-nowrap" href="/">
            <BrandMark className="h-[22px] w-[22px] transition-transform duration-500 ease-out group-hover:rotate-90" />
            <span className="text-[15px] font-semibold tracking-tight">{appConfig.name}</span>
          </Link>
          <span className="hidden rounded-md border border-white/10 bg-white/4 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-dim md:inline">
            See it · Ask · Bought
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-mist transition-colors duration-200 hover:bg-white/6 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          {signedIn ? (
            <Link className="btn btn-primary ml-1.5 h-9 px-4 text-[13px]" href="/request">
              Open the lens
            </Link>
          ) : (
            <Link className="btn btn-primary ml-1.5 h-9 px-4 text-[13px]" href={loginHref()}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
