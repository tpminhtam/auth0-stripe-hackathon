import Link from 'next/link';
import { bodyCopy, buttonRow, centeredPageShell, primaryButton, secondaryButton } from '@/lib/ui';

export default function CancelPage() {
  return (
    <main className={centeredPageShell}>
      <section className="panel anim-rise w-full p-8 sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/4 text-dim">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
            <path d="M9 15l6-6M15 15L9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </span>
        <p className="eyebrow mt-6 text-dim">Checkout canceled</p>
        <h1 className="mt-2.5 text-3xl font-semibold tracking-tight text-ink">No charge was made</h1>
        <p className={`${bodyCopy} mt-3`}>
          Your plan is unchanged, and anything waiting on an upgrade is still sitting in the cart.
          Pick a tier whenever you are ready.
        </p>
        <div className={`${buttonRow} mt-7`}>
          <Link className={`${primaryButton} max-sm:w-full`} href="/checkout">
            Back to plans
          </Link>
          <Link className={`${secondaryButton} max-sm:w-full`} href="/request">
            Open the lens
          </Link>
        </div>
      </section>
    </main>
  );
}
