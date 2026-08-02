import { NextResponse } from 'next/server';

import { upsertUserFromClerk } from '@/lib/data';
import { databaseConfigured } from '@/lib/database-config';
import { getServerAuthContext, getServerCurrentUser } from '@/lib/server-auth';
import { getPostHogClient } from '@/lib/posthog-server';

import { getStripeClient } from '@/lib/stripe';

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const body = (await request.json().catch(() => ({}))) as { interval?: string; tier?: string };
    const tier = body.tier === 'team' || body.tier === 'starter' ? body.tier : null;
    // Annual is two months free. The monthly ids are the ones the in-app upgrade
    // path uses, so they stay the default and are never swapped out from here.
    const annual = body.interval === 'year';
    const tierPriceId =
      tier === 'team'
        ? annual
          ? process.env.SAYSO_FAMILY_ANNUAL_PRICE_ID
          : process.env.SAYSO_TEAM_PRICE_ID
        : tier === 'starter'
          ? annual
            ? process.env.SAYSO_PERSONAL_ANNUAL_PRICE_ID
            : process.env.SAYSO_STARTER_PRICE_ID
          : null;
    const priceId = tierPriceId ?? process.env.STRIPE_PRICE_ID;
    const meteredPriceId = annual
      ? process.env.SAYSO_METERED_ANNUAL_PRICE_ID
      : process.env.SAYSO_METERED_PRICE_ID;

    const authContext = await getServerAuthContext();

    if (!authContext.userId) {
      return NextResponse.json(
        { error: 'Sign in is required before starting this subscription checkout.' },
        { status: 401 },
      );
    }


    let appUserId: string | null = null;
    let clerkUserId: string | null = authContext.userId;
    let customerEmail: string | null = null;

    if (clerkUserId) {
      const clerkUser = await getServerCurrentUser();
      const resolvedEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? authContext.email;
      if (databaseConfigured) {
        const record = await upsertUserFromClerk({
          clerkUserId,
          email: resolvedEmail,
        });

        appUserId = record.id;
        customerEmail = record.email;
      } else {
        customerEmail = resolvedEmail;
      }
    }


    if (!priceId) {
      throw new Error('Missing STRIPE_PRICE_ID. Run `npm run setup:stripe` and add the generated values to your deployment environment.');
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      success_url: origin + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: origin + '/cancel',
      ...(clerkUserId ? { client_reference_id: appUserId ?? clerkUserId } : {}),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(clerkUserId || appUserId
        ? {
            metadata: {
              ...(clerkUserId ? { clerk_user_id: clerkUserId } : {}),
              ...(appUserId ? { app_user_id: appUserId } : {}),
            },
          }
        : {}),

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
        // Stripe requires every recurring price on one subscription to share an
        // interval, so a yearly plan needs the yearly metered price — pairing it
        // with the monthly one is rejected outright.
        ...(meteredPriceId ? [{ price: meteredPriceId }] : []),
      ],
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout session did not return a redirect URL.' }, { status: 500 });
    }

    const distinctId =
      request.headers.get('x-posthog-distinct-id') ?? appUserId ?? clerkUserId ?? undefined;
    if (distinctId) {
      const sessionId = request.headers.get('x-posthog-session-id');
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId,
        event: 'checkout_session_created',
        properties: {
          stripe_session_id: session.id,
          stripe_price_id: priceId,
          customer_email: customerEmail,
          mode: 'subscription',
          ...(sessionId ? { $session_id: sessionId } : {}),
        },
      });
      await posthog.flush();
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create a checkout session.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
