import Link from 'next/link';
import { AppTopbar } from '@/components/app-topbar';
import { BrandMark } from '@/components/brand-mark';
import { FlowRail } from '@/components/flow-rail';
import { LoupeStage } from '@/components/loupe-stage';
import { ManageSubscriptionButton } from '@/components/manage-subscription-button';
import { auth0Configured } from '@/lib/auth0';
import { databaseConfigured } from '@/lib/database-config';
import { findLatestSubscriptionForUser, findUserByClerkId } from '@/lib/data';
import { getServerAuthContext } from '@/lib/server-auth';
import { loginHref } from '@/lib/wallets';

const capabilities = [
  {
    body: 'Point at anything you want. Boxes are drawn on-device in real time while a vision model names each thing, reads a brand off the tag when it can see one, and flags what would blow your limit.',
    tag: 'See',
    title: 'It sees exactly what you see',
  },
  {
    body: 'Ask “is it worth it?” and the agent goes and reads the live market — what it really sells for, whether this brand ever discounts, and if a sale is close enough to be worth waiting for. It shows you every source it checked.',
    tag: 'Know',
    title: 'An honest second opinion',
  },
  {
    body: 'Nothing is bought without your yes. The agent fills the cart; a human checks out. That charges a real Stripe PaymentIntent and meters it. Over the wallet’s cap? Whoever holds the card gets a say — or upgrade inline and the blocked purchase retries itself.',
    tag: 'Settle',
    title: 'Real money, on a leash',
  },
] as const;

function CapabilityIcon({ tag }: { tag: string }) {
  if (tag === 'See') {
    return (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (tag === 'Know') {
    return (
      <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
        <path d="M4 11v2M8 7.5v9M12 4v16M16 8.5v7M20 11v2" />
      </svg>
    );
  }
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 14.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STACK = ['Auth0 Organizations', 'Stripe Billing + meters', 'Stripe Projects', 'Neon', 'OpenRouter vision', 'ElevenLabs'];

export default async function HomePage() {
  const authContext = auth0Configured ? await getServerAuthContext() : null;
  const signedIn = Boolean(authContext?.userId);
  let latestSubscriptionStatus: string | null = null;

  if (databaseConfigured && authContext?.userId) {
    const user = await findUserByClerkId(authContext.userId);

    if (user) {
      const latestSubscription = await findLatestSubscriptionForUser(user.id);
      latestSubscriptionStatus = latestSubscription?.status ?? null;
    }
  }

  const hasManageableSubscription = Boolean(
    latestSubscriptionStatus &&
      latestSubscriptionStatus !== 'canceled' &&
      latestSubscriptionStatus !== 'incomplete_expired',
  );

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="grid-veil" aria-hidden />
      <AppTopbar signedIn={signedIn} />

      <div className="mx-auto w-full max-w-6xl px-5">
        {/* ── Hero, with the loupe roaming behind it ─────────── */}
        <section className="relative flex min-h-[720px] flex-col items-center justify-center pt-28 sm:pt-32">
          <LoupeStage />

          <div className="relative z-10 flex flex-col items-center gap-6 text-center">
            <span
              className="anim-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-void/70 px-3.5 py-1.5"
              style={{ '--d': '40ms' } as React.CSSProperties}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-beam opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-beam" />
              </span>
              <span className="eyebrow text-mist">Your shopping agent, end to end</span>
            </span>

            <h1
              className="display anim-rise max-w-3xl text-[clamp(2.75rem,7vw,5.25rem)] text-ink"
              style={{ '--d': '120ms' } as React.CSSProperties}
            >
              See it. Ask. Bought.
            </h1>

            <p
              className="anim-rise max-w-xl text-balance text-[17px] leading-relaxed text-mist"
              style={{ '--d': '220ms' } as React.CSSProperties}
            >
              You&rsquo;re looking at something you want. Loupe is the agent standing next to you — it sees what
              you see, reads the market to tell you what it&rsquo;s honestly worth and whether to wait for a sale,
              and then buys it on a leash you set.
            </p>

            <div
              className="anim-rise mt-1 flex flex-wrap items-center justify-center gap-2.5"
              style={{ '--d': '300ms' } as React.CSSProperties}
            >
              {signedIn ? (
                <>
                  <Link className="btn btn-primary h-11 px-6" href="/request">
                    Open the lens
                  </Link>
                  <Link className="btn btn-ghost h-11 px-6" href="/approvals">
                    Checkout
                  </Link>
                </>
              ) : (
                <>
                  <Link className="btn btn-primary h-11 px-6" href={loginHref()}>
                    Sign in to start
                  </Link>
                  <Link className="btn btn-ghost h-11 px-6" href="/checkout">
                    See plans
                  </Link>
                </>
              )}
            </div>

            {hasManageableSubscription ? (
              <div className="anim-rise" style={{ '--d': '340ms' } as React.CSSProperties}>
                <ManageSubscriptionButton />
              </div>
            ) : null}
          </div>
        </section>

        <div className="flex flex-col gap-12 pb-4 sm:gap-14">
          <FlowRail />

          {/* ── Capabilities ─────────────────────────────────── */}
          <div className="grid gap-3 md:grid-cols-3">
            {capabilities.map((capability, index) => (
              <div
                key={capability.title}
                className="panel lift anim-rise flex flex-col p-6"
                style={{ '--d': `${480 + index * 80}ms` } as React.CSSProperties}
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-white/5 text-beam">
                    <CapabilityIcon tag={capability.tag} />
                  </span>
                  <span className="eyebrow text-dim">{capability.tag}</span>
                </div>
                <h2 className="text-[17px] font-semibold tracking-tight text-ink">{capability.title}</h2>
                <p className="mt-2.5 text-[13.5px] leading-6 text-mist">{capability.body}</p>
              </div>
            ))}
          </div>

        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <footer className="mt-14 flex flex-col gap-6 border-t border-white/8 py-9 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark className="h-5 w-5" />
            <p className="text-[13px] text-dim">
              <span className="font-semibold text-mist">Loupe</span> — see it, ask, bought.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STACK.map((item) => (
              <span
                key={item}
                className="rounded-md border border-white/8 px-2.5 py-1 font-mono text-[10.5px] tracking-tight text-dim transition-colors duration-200 hover:border-white/18 hover:text-mist"
              >
                {item}
              </span>
            ))}
          </div>
        </footer>
      </div>
    </main>
  );
}
