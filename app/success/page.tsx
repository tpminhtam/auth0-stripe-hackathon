import Link from 'next/link';
import { appConfig } from '@/lib/app-config';
import { databaseConfigured } from '@/lib/database-config';
import { syncSubscriptionFromCheckoutSessionID } from '@/lib/subscription-sync';
import { sendWelcomeEmailForSubscriptionOnce } from '@/lib/twilio-email';
import { bodyCopy, buttonRow, centeredPageShell, primaryButton, secondaryButton } from '@/lib/ui';

type SuccessPageProps = {
  searchParams?: Promise<{
    session_id?: string | string[];
  }>;
};

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const sessionID =
    typeof resolvedSearchParams?.session_id === 'string'
      ? resolvedSearchParams.session_id
      : null;

  let subscriptionMessage: string | null = null;

  if (databaseConfigured && sessionID) {
    try {
      const result = await syncSubscriptionFromCheckoutSessionID(sessionID);

      if (result?.userId) {
        subscriptionMessage =
          'This checkout was linked to the signed-in user in your starter database.';
      } else if (result) {
        subscriptionMessage =
          'This checkout completed, but there was no signed-in user to attach in your starter database.';
      }

      if (
        (result?.status === 'active' || result?.status === 'trialing') &&
        result.email
      ) {
        await sendWelcomeEmailForSubscriptionOnce({
          stripeSubscriptionId: result.stripeSubscriptionId,
          to: result.email,
          productName: appConfig.name,
        });
      }
    } catch (error) {
      subscriptionMessage =
        error instanceof Error
          ? error.message
          : 'Unable to sync the starter subscription record from this checkout session.';
    }
  }

  return (
    <main className={centeredPageShell}>
      <section className="panel-jade anim-rise w-full p-8 sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-jade/30 bg-jade/10 text-jade">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.2 4.2L19 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="22"
              strokeDashoffset="22"
              style={{ animation: 'draw 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s both' }}
            />
          </svg>
        </span>
        <p className="eyebrow mt-6 text-jade">Subscription active</p>
        <h1 className="mt-2.5 text-3xl font-semibold tracking-tight text-ink">Your plan is live</h1>
        <p className={`${bodyCopy} mt-3`}>
          Checkout now enforces your new per-purchase limit, and every completed purchase meters at 50¢ on Stripe
          Billing. Point the lens at what you want — nothing reaches the cart until you say so.
        </p>
        {subscriptionMessage ? (
          <p className="mt-5 rounded-xl border border-white/10 bg-white/4 px-4 py-3 font-mono text-[11px] leading-relaxed text-dim">
            {subscriptionMessage}
          </p>
        ) : null}
        <div className={`${buttonRow} mt-7`}>
          <Link className={`${primaryButton} max-sm:w-full`} href="/request">
            Open the lens
          </Link>
          <Link className={`${secondaryButton} max-sm:w-full`} href="/approvals">
            Checkout
          </Link>
        </div>
      </section>
    </main>
  );
}
