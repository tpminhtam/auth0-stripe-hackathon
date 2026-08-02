import { NextResponse } from 'next/server';
import { getServerAuthContext } from '@/lib/server-auth';
import { findOffers } from '@/lib/vision';

export const maxDuration = 45;

/**
 * "Where can I actually buy this?" — read-only, and fired by the client AFTER
 * the proposal is already on screen. Nothing here can delay or block the
 * confirm card; an empty list is a perfectly good answer.
 */
export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const body = (await request.json()) as { item?: string };
    const item = body.item?.trim();
    if (!item) {
      return NextResponse.json({ offers: [] });
    }

    return NextResponse.json({ offers: await findOffers(item) });
  } catch {
    return NextResponse.json({ offers: [] });
  }
}
