import { NextResponse } from 'next/server';
import { getBillingForUser, TIER_LABELS, type UserBilling } from '@/lib/billing';
import { getServerAuthContext } from '@/lib/server-auth';
import { scanFrame } from '@/lib/vision';

export const maxDuration = 30;

const billingCache = new Map<string, { billing: UserBilling; expiresAt: number }>();

async function getCachedBilling(userId: string) {
  const cached = billingCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.billing;
  }

  const billing = await getBillingForUser(userId);
  billingCache.set(userId, { billing, expiresAt: Date.now() + 60_000 });
  return billing;
}

export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const body = (await request.json()) as { imageDataUrl?: string };
    if (!body.imageDataUrl?.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Send an image frame.' }, { status: 400 });
    }

    const [scan, billing] = await Promise.all([
      scanFrame(body.imageDataUrl),
      getCachedBilling(authContext.userId),
    ]);

    return NextResponse.json({
      comment: scan.comment,
      items: scan.items.map((item) => ({
        ...item,
        est_price_cents: Math.round(item.est_price_dollars * 100),
        over_limit:
          item.kind === 'product' && Math.round(item.est_price_dollars * 100) > billing.spendLimitCents,
      })),
      limitCents: billing.spendLimitCents,
      tierLabel: TIER_LABELS[billing.tier],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
