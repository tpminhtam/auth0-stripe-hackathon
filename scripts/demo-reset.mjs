/**
 * Put the demo back to its starting state.
 *
 *   node --env-file=.env --env-file=.env.local scripts/demo-reset.mjs
 *
 * Every rehearsal ends with you on Family (you upgraded, on stage, to clear the
 * $100 wall) and with rows in the approvals inbox. Run this and both go back.
 *
 * It does NOT sign you out — only your browser can do that. Visit /auth/logout.
 */
import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sql = neon(process.env.NEON_POSTGRES_CONNECTION_STRING);
const PERSONAL = process.env.SAYSO_STARTER_PRICE_ID;
const FAMILY = process.env.SAYSO_TEAM_PRICE_ID;

// 1. Back onto Personal, so the $100 cap is in force and the wall fires again.
const subs = await stripe.subscriptions.list({ status: 'active', limit: 10 });
let moved = 0;
for (const sub of subs.data) {
  const base = sub.items.data.find((i) => i.price.id === FAMILY || i.price.id === PERSONAL);
  if (!base) {
    console.log(`- ${sub.id}: no Personal/Family item, left alone`);
    continue;
  }
  if (base.price.id === PERSONAL) {
    console.log(`✓ ${sub.id}: already on Personal`);
    continue;
  }
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: base.id, price: PERSONAL }],
    proration_behavior: 'none',
  });
  console.log(`✓ ${sub.id}: Family → Personal`);
  moved += 1;
}

// 2. Empty the inbox so everything a judge sees was made live on stage.
const before = await sql.query('select count(*)::int n from purchase_requests');
await sql.query('delete from purchase_requests');
console.log(`✓ cleared ${before[0].n} purchase request row(s)`);

// 3. Confirm the cap the app will actually compute.
const check = await stripe.subscriptions.list({ status: 'active', limit: 5 });
const tier = check.data.some((s) => s.items.data.some((i) => i.price.id === FAMILY)) ? 'FAMILY' : 'PERSONAL';
console.log(`\nplan: ${tier}  ·  cap: ${tier === 'FAMILY' ? '$1,000' : '$100'}${moved ? '  (downgraded)' : ''}`);
console.log(tier === 'PERSONAL' ? '✅ ready — the wall will fire' : '❌ still on Family — the wall will NOT fire');
console.log('\nNow sign out in Safari:  http://localhost:3001/auth/logout');
