import { NextResponse } from 'next/server';
import { getBillingForUser } from '@/lib/billing';
import { getServerAuthContext } from '@/lib/server-auth';
import { getStripeClient } from '@/lib/stripe';

export const maxDuration = 30;

export async function POST() {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const teamPriceId = process.env.SAYSO_TEAM_PRICE_ID;
    const starterPriceId = process.env.SAYSO_STARTER_PRICE_ID;
    if (!teamPriceId || !starterPriceId) {
      return NextResponse.json({ error: 'Billing tiers are not configured.' }, { status: 500 });
    }

    const billing = await getBillingForUser(authContext.userId);
    if (!billing.subscriptionId) {
      return NextResponse.json({ error: 'No active subscription — pick a plan first.', needsCheckout: true }, { status: 400 });
    }
    if (billing.tier === 'team') {
      return NextResponse.json({ tier: 'team' });
    }

    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(billing.subscriptionId);
    const baseItem = subscription.items.data.find((item) => item.price.id === starterPriceId);
    if (!baseItem) {
      return NextResponse.json({ error: 'Could not find the Starter plan item on this subscription.' }, { status: 500 });
    }

    await stripe.subscriptions.update(billing.subscriptionId, {
      items: [{ id: baseItem.id, price: teamPriceId }],
      proration_behavior: 'always_invoice',
    });

    return NextResponse.json({ tier: 'team' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upgrade failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
