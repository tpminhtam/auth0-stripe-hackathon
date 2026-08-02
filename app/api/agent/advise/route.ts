import { NextResponse } from 'next/server';
import { getServerAuthContext } from '@/lib/server-auth';
import { adviseOnItem, describeAdviceForSpeech } from '@/lib/vision';
import { getWallet } from '@/lib/wallets';

// Two model calls, the second of which runs a live web search. Slower than the
// rest of the agent by design — this is the one that goes and reads the market.
export const maxDuration = 60;

/**
 * "Is this worth it?" — read-only. Nothing is proposed, staged or charged here;
 * the shopper gets an opinion and decides what to do with it.
 */
export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const body = (await request.json()) as {
      imageDataUrl?: string;
      scanContext?: string[];
      transcript?: string;
    };

    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: 'Ask about something first.' }, { status: 400 });
    }

    const imageDataUrl =
      typeof body.imageDataUrl === 'string' && body.imageDataUrl.startsWith('data:image/')
        ? body.imageDataUrl
        : null;

    const scanContext = Array.isArray(body.scanContext)
      ? body.scanContext.filter((entry): entry is string => typeof entry === 'string').slice(0, 6)
      : undefined;

    // The Auth0 organization on the session decides whose money this is, which
    // is what makes the same item get different advice in different wallets.
    const wallet = getWallet(authContext.orgId);

    const advice = await adviseOnItem({
      imageDataUrl,
      scanContext,
      transcript,
      walletStance: wallet?.stance ?? null,
    });

    return NextResponse.json({
      advice,
      speech: describeAdviceForSpeech(advice),
      wallet: wallet ? { caption: wallet.caption, label: wallet.label } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The advisor hit an unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
