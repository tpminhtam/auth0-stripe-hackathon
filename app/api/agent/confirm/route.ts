import { NextResponse } from 'next/server';
import { createPurchaseRequest } from '@/lib/sayso-data';
import { getServerAuthContext } from '@/lib/server-auth';
import { describeConfirmationForSpeech, type OrderProposal } from '@/lib/vision';

export const maxDuration = 30;

/**
 * The requester said yes — persist the proposal so it lands in the approver's
 * inbox. The proposal round-trips through the client, so re-validate it here.
 * Amounts are still enforced server-side at approval time (the decide route's
 * spend-limit check), so a tampered total cannot buy past the plan limit.
 */
function sanitizeProposal(raw: unknown): OrderProposal | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const item = typeof candidate.item === 'string' ? candidate.item.trim().slice(0, 200) : '';
  const totalCents = Math.round(Number(candidate.total_cents));
  if (!item || !Number.isFinite(totalCents) || totalCents < 1) {
    return null;
  }

  const quantity = Math.max(1, Math.round(Number(candidate.quantity) || 1));
  const unitPriceCents = Math.round(Number(candidate.unit_price_cents));

  return {
    category: typeof candidate.category === 'string' ? candidate.category.trim().slice(0, 50) : 'other',
    item,
    quantity,
    rationale: typeof candidate.rationale === 'string' ? candidate.rationale.trim().slice(0, 500) : '',
    total_cents: totalCents,
    unit_price_cents:
      Number.isFinite(unitPriceCents) && unitPriceCents > 0 ? unitPriceCents : Math.round(totalCents / quantity),
  };
}

export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in before sending a request.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      imageDataUrl?: string;
      proposal?: unknown;
      transcript?: string;
    };

    const proposal = sanitizeProposal(body.proposal);
    if (!proposal) {
      return NextResponse.json({ error: 'That proposal expired — ask the agent again.' }, { status: 400 });
    }

    const imageDataUrl =
      typeof body.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/')
        ? body.imageDataUrl
        : null;

    const purchaseRequest = await createPurchaseRequest({
      amountCents: proposal.total_cents,
      category: proposal.category,
      imageDataUrl,
      item: proposal.item,
      orgId: authContext.orgId,
      quantity: proposal.quantity,
      rationale: proposal.rationale,
      requesterEmail: authContext.email,
      requesterUserId: authContext.userId,
      transcript: body.transcript?.trim() || proposal.item,
    });

    return NextResponse.json({
      proposal,
      request: purchaseRequest,
      speech: describeConfirmationForSpeech(proposal),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send that to your approver.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
