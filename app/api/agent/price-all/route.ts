import { NextResponse } from 'next/server';
import { getServerAuthContext } from '@/lib/server-auth';
import { priceItems } from '@/lib/vision';

// One live web search per item, run in parallel — generous ceiling so a slow
// venue link returns an answer rather than a timeout.
export const maxDuration = 60;

/**
 * "How much is everything you just showed me, and where do I buy it?"
 *
 * Read-only. Nothing is proposed, staged or charged — this only reads the
 * market for a list of things the lens already named.
 */
export async function POST(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    const body = (await request.json()) as { items?: unknown };
    const items = Array.isArray(body.items)
      ? body.items.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : [];

    if (items.length === 0) {
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({ items: await priceItems(items) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not price those.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
