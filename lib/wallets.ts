/**
 * Whose money is this?
 *
 * The Stripe plan sets the HARD cap — that is what returns a 402 and fires the
 * upgrade wall, and it does not change here. This file is the layer above it:
 * the agent's judgement about spending, which is different depending on which
 * Auth0 Organization you are currently acting in.
 *
 * Spending on your own card and spending on your husband's card are not the
 * same act, and an agent that gives identical advice for both is not paying
 * attention. The Auth0 role already encodes it — on his card you hold
 * `requester` only, so you cannot self-approve even if you wanted to.
 */

export type Wallet = {
  /** One line for the advice card, so it is always obvious whose money is in play. */
  caption: string;
  id: string;
  label: string;
  /** Injected into the advisor prompt. This is what actually changes the advice. */
  stance: string;
};

const SELF: Omit<Wallet, 'id'> = {
  caption: 'your own card — you approve yourself',
  label: 'My card',
  stance: `This is the shopper's OWN money, on a card only they answer for.
Be candid and unfussy. If they want it and the price is fair, say so — you do not need to talk them out of things they can afford. Your job here is honest pricing and good timing, nothing more. Do not moralise about the purchase.`,
};

const PARTNER: Omit<Wallet, 'id'> = {
  caption: "your husband's card — he approves, and he sees every line",
  label: "Husband's card",
  stance: `This is the shopper's HUSBAND'S credit card, shared for household spending. He approves every purchase and sees every line item.
Be noticeably more conservative than you would be with their own money:
- Lean towards waiting. If a sale is anywhere near, recommend it. "It'll be cheaper in three weeks" is easy to justify to someone else; "I wanted it" is not.
- Distinguish shared from personal. Things the household uses — groceries, home goods, drinkware, anything for both of them — are easy. Clothing, bags, jewellery, watches and other personal or discretionary items deserve a gentle flag that this is his card, and a suggestion to check with him first.
- Above roughly seventy-five dollars on anything personal, say plainly that this is worth a conversation rather than a surprise.
- Never be preachy or scolding about it. One clear sentence, said warmly, the way a good friend would: you are protecting them from an awkward conversation, not lecturing them.`,
};

/**
 * Sign-in MUST land inside an organization.
 *
 * A plain `/auth/login` produces a session with no `org_id`, and then
 * `getWallet()` returns null — so the agent has no idea whose money it is and
 * silently drops back to generic advice. The approvals inbox also stops
 * filtering by org. Neither failure is visible on screen, which is exactly what
 * makes it dangerous on stage.
 */
export function loginHref(returnTo = '/request') {
  const params = new URLSearchParams();
  const acme = process.env.SAYSO_ORG_ACME_ID;
  if (acme) {
    params.set('organization', acme);
  }
  params.set('returnTo', returnTo);
  return `/auth/login?${params.toString()}`;
}

export function getWallet(orgId: string | null | undefined): Wallet | null {
  const acme = process.env.SAYSO_ORG_ACME_ID;
  const globex = process.env.SAYSO_ORG_GLOBEX_ID;

  if (orgId && acme && orgId === acme) {
    return { ...SELF, id: acme };
  }
  if (orgId && globex && globex === orgId) {
    return { ...PARTNER, id: globex };
  }
  return null;
}
