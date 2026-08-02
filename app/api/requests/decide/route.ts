import { NextResponse } from 'next/server';
import { isApproverForContext } from '@/lib/approver';
import { getBillingForUser, reportPurchaseMeterEvent, spendLimitForTier, TIER_LABELS } from '@/lib/billing';
import { getServerAuthContext } from '@/lib/server-auth';
import { decidePurchaseRequest, getPurchaseRequest } from '@/lib/sayso-data';
import { getStripeClient } from '@/lib/stripe';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    if (!(await isApproverForContext(authContext))) {
      return NextResponse.json({ error: 'Only approvers can decide requests.' }, { status: 403 });
    }

    const body = (await request.json()) as { decision?: string; id?: string };
    if (!body.id || (body.decision !== 'approve' && body.decision !== 'deny')) {
      return NextResponse.json({ error: 'Provide a request id and a decision of approve or deny.' }, { status: 400 });
    }

    const existing = await getPurchaseRequest(body.id);
    if (!existing) {
      return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
    }

    if (existing.status !== 'pending_approval') {
      return NextResponse.json({ error: `Request is already ${existing.status}.` }, { status: 409 });
    }

    const decidedBy = authContext.email ?? authContext.userId;

    if (body.decision === 'deny') {
      const denied = await decidePurchaseRequest({ decidedBy, id: existing.id, status: 'denied' });
      return NextResponse.json({ request: denied });
    }

    const billing = await getBillingForUser(authContext.userId);
    if (existing.amountCents > billing.spendLimitCents) {
      const limitDollars = (billing.spendLimitCents / 100).toFixed(0);
      return NextResponse.json(
        {
          error: `$${(existing.amountCents / 100).toFixed(2)} is over the ${TIER_LABELS[billing.tier]} plan's $${limitDollars} per-purchase limit. Upgrade to approve larger purchases.`,
          limitCents: billing.spendLimitCents,
          tier: billing.tier,
          upgradeNeeded: true,
        },
        { status: 402 },
      );
    }

    const stripe = getStripeClient();

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: existing.amountCents,
        currency: existing.currency,
        confirm: true,
        payment_method: 'pm_card_visa',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: `Loupe: ${existing.quantity} × ${existing.item}`,
        metadata: {
          sayso_request_id: existing.id,
          requester: existing.requesterEmail ?? existing.requesterUserId,
          approved_by: decidedBy,
        },
      });

      const paid = await decidePurchaseRequest({
        decidedBy,
        id: existing.id,
        status: paymentIntent.status === 'succeeded' ? 'paid' : 'approved',
        stripePaymentIntentId: paymentIntent.id,
      });

      const meterReported = await reportPurchaseMeterEvent({
        customerId: billing.customerId,
        requestId: existing.id,
      }).catch(() => false);

      return NextResponse.json({ meterReported, request: paid });
    } catch (paymentError) {
      await decidePurchaseRequest({ decidedBy, id: existing.id, status: 'failed' });
      const message = paymentError instanceof Error ? paymentError.message : 'Payment failed.';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to decide this request.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
