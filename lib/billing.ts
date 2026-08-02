import { findUserByClerkId } from '@/lib/data';
import { getStripeClient } from '@/lib/stripe';

export type Tier = 'none' | 'starter' | 'team';

export type UserBilling = {
  customerId: string | null;
  spendLimitCents: number;
  subscriptionId: string | null;
  tier: Tier;
};

const SPEND_LIMITS_CENTS: Record<Tier, number> = {
  none: 5_000,
  starter: 10_000,
  team: 100_000,
};

export const TIER_LABELS: Record<Tier, string> = {
  none: 'Free trial',
  starter: 'Starter',
  team: 'Team',
};

export function spendLimitForTier(tier: Tier) {
  return SPEND_LIMITS_CENTS[tier];
}

export async function getBillingForUser(authUserId: string): Promise<UserBilling> {
  const fallback: UserBilling = {
    customerId: null,
    spendLimitCents: SPEND_LIMITS_CENTS.none,
    subscriptionId: null,
    tier: 'none',
  };

  const user = await findUserByClerkId(authUserId).catch(() => null);
  if (!user?.stripeCustomerId) {
    return fallback;
  }

  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: 'active',
    limit: 5,
  });

  const starterPriceId = process.env.SAYSO_STARTER_PRICE_ID;
  const teamPriceId = process.env.SAYSO_TEAM_PRICE_ID;

  let tier: Tier = 'none';
  let subscriptionId: string | null = null;

  for (const subscription of subscriptions.data) {
    for (const item of subscription.items.data) {
      if (teamPriceId && item.price.id === teamPriceId) {
        tier = 'team';
        subscriptionId = subscription.id;
      } else if (starterPriceId && item.price.id === starterPriceId && tier !== 'team') {
        tier = 'starter';
        subscriptionId = subscription.id;
      }
    }
  }

  if (tier === 'none' && subscriptions.data.length > 0) {
    tier = 'starter';
    subscriptionId = subscriptions.data[0].id;
  }

  return {
    customerId: user.stripeCustomerId,
    spendLimitCents: SPEND_LIMITS_CENTS[tier],
    subscriptionId,
    tier,
  };
}

export async function reportPurchaseMeterEvent(input: { customerId: string | null; requestId: string }) {
  const eventName = process.env.SAYSO_METER_EVENT_NAME;
  if (!eventName || !input.customerId) {
    return false;
  }

  const stripe = getStripeClient();
  await stripe.billing.meterEvents.create({
    event_name: eventName,
    identifier: `sayso-${input.requestId}`,
    payload: {
      stripe_customer_id: input.customerId,
      value: '1',
    },
  });

  return true;
}
