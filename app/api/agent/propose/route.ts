import { NextResponse } from 'next/server';
import { getBillingForUser, TIER_LABELS } from '@/lib/billing';
import { getServerAuthContext } from '@/lib/server-auth';
import { describeProposalForSpeech, proposeOrder } from '@/lib/vision';

export const maxDuration = 60;

/**
 * Builds a proposal and returns it for the requester to confirm. This route is
 * deliberately READ-ONLY — the purchase request is created by
 * `/api/agent/confirm` once the requester says yes.
 */
export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in before sending a request.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      imageDataUrl?: string;
      scanContext?: string[];
      transcript?: string;
    };
    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: 'Say or type what you need first.' }, { status: 400 });
    }

    const imageDataUrl =
      typeof body.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/')
        ? body.imageDataUrl
        : null;

    const scanContext = Array.isArray(body.scanContext)
      ? body.scanContext.filter((entry): entry is string => typeof entry === 'string').slice(0, 6)
      : undefined;

    const [proposal, billing] = await Promise.all([
      proposeOrder({ imageDataUrl, scanContext, transcript }),
      getBillingForUser(authContext.userId),
    ]);

    const limit = { limitCents: billing.spendLimitCents, tierLabel: TIER_LABELS[billing.tier] };

    return NextResponse.json({
      proposal,
      limitCents: limit.limitCents,
      overLimit: proposal.total_cents > limit.limitCents,
      speech: describeProposalForSpeech(proposal, limit),
      tierLabel: limit.tierLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The purchasing agent hit an unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
