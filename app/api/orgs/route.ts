import { NextResponse } from 'next/server';
import { getServerAuthContext } from '@/lib/server-auth';

export async function GET() {
  // Only signed-in callers. The switcher lives on auth-gated pages, so this
  // costs nothing — and it stops the deployed app handing Auth0 org ids to
  // anyone who curls it.
  const authContext = await getServerAuthContext();
  if (!authContext.userId) {
    return NextResponse.json({ orgs: [] }, { status: 401 });
  }

  const orgs = [
    // Display names only. The Auth0 org ids behind them never change, so these
    // two strings are the whole cost of re-theming the multi-tenant story.
    // ACME  = your own card      → you hold approver + requester, so you self-approve
    // GLOBEX = your husband's card → you hold requester ONLY, so he has to approve
    // Labels are cosmetic; lib/wallets.ts is what changes the agent's advice.
    process.env.SAYSO_ORG_ACME_ID ? { id: process.env.SAYSO_ORG_ACME_ID, label: 'My card' } : null,
    process.env.SAYSO_ORG_GLOBEX_ID ? { id: process.env.SAYSO_ORG_GLOBEX_ID, label: "Husband's card" } : null,
  ].filter(Boolean);

  return NextResponse.json({ orgs });
}
