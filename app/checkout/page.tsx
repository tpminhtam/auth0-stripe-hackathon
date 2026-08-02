import Link from 'next/link';
import { AppTopbar } from '@/components/app-topbar';
import { CheckoutButton } from '@/components/checkout-button';
import { getServerAuthContext } from '@/lib/server-auth';

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

/*
 * Personal is sold on unlimited research — that is the real variable cost, so it
 * is the honest thing to charge for. Family is sold on the SHARED WALLET, not on
 * the bigger number: more people on one card is why it costs more, and the
 * higher ceiling simply comes with a household. Nobody pays for permission to
 * spend their own money.
 */
const tiers = [
  {
    annual: '$49.99',
    cap: '$100',
    capNote: 'default limit per purchase — you can lower it any time',
    cta: 'Get Personal',
    features: [
      'Unlimited price checks with live web research',
      'Buy-or-wait advice on anything you point at',
      'The agent buys for you, once you say yes',
      'Watch an item and get told when it drops',
      'Just you, one card',
    ],
    highlight: false,
    name: 'Personal',
    price: '$4.99',
    tier: 'starter' as const,
  },
  {
    annual: '$99.99',
    cap: '$1,000',
    capNote: 'default limit per purchase — set your own per person',
    cta: 'Get Family',
    features: [
      'Everything in Personal',
      'Up to 3 people on one wallet',
      'Up to 2 credit cards',
      'Checkout rules: who can spend, who has to say yes',
      'Per-person limits — spend under it without asking',
      'Advice adapts to whose card it is',
    ],
    highlight: true,
    name: 'Family',
    price: '$9.99',
    tier: 'team' as const,
  },
];

export default async function CheckoutPage() {
  const authContext = await getServerAuthContext();

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="grid-veil" aria-hidden />
      <AppTopbar signedIn={Boolean(authContext.userId)} />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-24 pt-32 sm:pt-36">
        <span className="anim-rise eyebrow rounded-full border border-white/10 bg-white/4 px-3.5 py-1.5 text-dim">
          Loupe plans
        </span>
        <h1
          className="display anim-rise mt-6 text-center text-[clamp(2.4rem,6vw,3.6rem)]"
          style={{ '--d': '80ms' } as React.CSSProperties}
        >
          An agent you can
          <br />
          trust with the card
        </h1>
        <p
          className="anim-rise mt-5 max-w-xl text-balance text-center text-[15px] leading-7 text-mist"
          style={{ '--d': '160ms' } as React.CSSProperties}
        >
          Research is unlimited on every paid plan — that&rsquo;s the part that costs us money, not you. Family is for
          sharing one wallet with the people you actually buy things with. Two months free on annual.
        </p>

        <div className="mt-12 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {tiers.map((plan, index) => (
            <div
              key={plan.tier}
              className={`anim-rise lift relative flex flex-col p-7 ${plan.highlight ? 'panel-lit' : 'panel'}`}
              style={{ '--d': `${240 + index * 100}ms` } as React.CSSProperties}
            >
              {plan.highlight ? (
                <span className="absolute -top-3 right-6 rounded-full border border-beam/40 bg-void px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-beam">
                  Most households
                </span>
              ) : null}

              <h2 className="text-lg font-semibold tracking-tight text-ink">{plan.name}</h2>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="tabular display text-[3rem] text-ink">{plan.price}</span>
                <span className="text-[15px] text-dim">/ month</span>
              </div>
              <p className="mt-1 font-mono text-[12px] text-dim">
                or <span className="text-mist">{plan.annual}</span> / year — 2 months free
              </p>

              <div
                className={`mt-6 rounded-2xl border p-4 ${
                  plan.highlight ? 'border-beam/25 bg-beam/8' : 'border-white/10 bg-white/3'
                }`}
              >
                <p className={`tabular display text-[2rem] ${plan.highlight ? 'text-beam' : 'text-flare'}`}>
                  {plan.cap}
                </p>
                <p className="eyebrow mt-1.5 text-dim">{plan.capNote}</p>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-[14px] leading-6 text-mist">
                    <CheckIcon className={`mt-1 h-4 w-4 shrink-0 ${plan.highlight ? 'text-beam' : 'text-jade'}`} />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-auto space-y-2 pt-8">
                {authContext.userId ? (
                  <>
                    <CheckoutButton label={`${plan.cta} — ${plan.price}/mo`} tier={plan.tier} />
                    <CheckoutButton
                      interval="year"
                      label={`or pay yearly — ${plan.annual}`}
                      tier={plan.tier}
                      variant="ghost"
                    />
                  </>
                ) : (
                  <Link className="btn btn-primary h-11 w-full" href="/sign-in?redirect_to=/checkout">
                    Sign in to continue
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        <p
          className="anim-rise mt-10 text-center font-mono text-[11px] leading-relaxed text-dim"
          style={{ '--d': '460ms' } as React.CSSProperties}
        >
          subscription + metered usage on Stripe Billing · test mode
        </p>

        <Link className="btn btn-ghost mt-6 h-11 px-6" href="/approvals">
          &larr; Back to checkout
        </Link>
      </div>
    </main>
  );
}
