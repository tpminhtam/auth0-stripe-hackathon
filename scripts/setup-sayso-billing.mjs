import * as fs from 'node:fs';
import * as path from 'node:path';
import Stripe from 'stripe';

const ENV_FILE = '.env.local';
const METER_EVENT_NAME = 'sayso_purchase';

const rootDir = process.cwd();
const envPath = path.join(rootDir, ENV_FILE);

if (process.env.SAYSO_TEAM_PRICE_ID) {
  console.log(`Say-So billing is already configured with ${process.env.SAYSO_TEAM_PRICE_ID}.`);
  process.exit(0);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.log('Missing STRIPE_SECRET_KEY. Run with: node --env-file=.env.local scripts/setup-sayso-billing.mjs');
  process.exit(1);
}

const stripe = new Stripe(secretKey);

async function findOrCreateMeter() {
  const existing = await stripe.billing.meters.list({ limit: 100 });
  const match = existing.data.find((meter) => meter.event_name === METER_EVENT_NAME && meter.status === 'active');
  if (match) {
    return match;
  }

  return stripe.billing.meters.create({
    display_name: 'Say-So purchases',
    event_name: METER_EVENT_NAME,
    default_aggregation: { formula: 'sum' },
    value_settings: { event_payload_key: 'value' },
    customer_mapping: { event_payload_key: 'stripe_customer_id', type: 'by_id' },
  });
}

function idempotency(resource) {
  return { idempotencyKey: `sayso-billing-${resource}` };
}

async function main() {
  const meter = await findOrCreateMeter();
  console.log(`Meter: ${meter.id} (${METER_EVENT_NAME})`);

  const starterProduct = await stripe.products.create(
    { name: 'Say-So Starter', description: 'Voice purchasing for small teams. $100 per-purchase approval limit.' },
    idempotency('starter-product'),
  );
  const starterPrice = await stripe.prices.create(
    { currency: 'usd', product: starterProduct.id, recurring: { interval: 'month' }, unit_amount: 1900, nickname: 'Starter' },
    idempotency('starter-price'),
  );

  const teamProduct = await stripe.products.create(
    { name: 'Say-So Team', description: 'Voice purchasing for growing teams. $1,000 per-purchase approval limit.' },
    idempotency('team-product'),
  );
  const teamPrice = await stripe.prices.create(
    { currency: 'usd', product: teamProduct.id, recurring: { interval: 'month' }, unit_amount: 9900, nickname: 'Team' },
    idempotency('team-price'),
  );

  const usageProduct = await stripe.products.create(
    { name: 'Say-So usage', description: 'Metered fee per approved purchase.' },
    idempotency('usage-product'),
  );
  const meteredPrice = await stripe.prices.create(
    {
      currency: 'usd',
      product: usageProduct.id,
      nickname: 'Per approved purchase',
      recurring: { interval: 'month', usage_type: 'metered', meter: meter.id },
      billing_scheme: 'per_unit',
      unit_amount: 50,
    },
    idempotency('usage-price'),
  );

  const portalConfig = await stripe.billingPortal.configurations.create(
    {
      business_profile: { headline: 'Say-So — billing your whole team can say yes to.' },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price'],
          proration_behavior: 'always_invoice',
          products: [
            { product: starterProduct.id, prices: [starterPrice.id] },
            { product: teamProduct.id, prices: [teamPrice.id] },
          ],
        },
      },
    },
    idempotency('portal-config'),
  );

  writeEnvFile(envPath, {
    SAYSO_STARTER_PRICE_ID: starterPrice.id,
    SAYSO_TEAM_PRICE_ID: teamPrice.id,
    SAYSO_METERED_PRICE_ID: meteredPrice.id,
    SAYSO_METER_ID: meter.id,
    SAYSO_METER_EVENT_NAME: METER_EVENT_NAME,
    SAYSO_PORTAL_CONFIG_ID: portalConfig.id,
  });

  console.log(`Starter: ${starterPrice.id}`);
  console.log(`Team: ${teamPrice.id}`);
  console.log(`Metered: ${meteredPrice.id}`);
  console.log(`Portal config: ${portalConfig.id}`);
  console.log(`Updated ${ENV_FILE}.`);
}

function writeEnvFile(filePath, updates) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const seen = new Set();
  const lines = existing
    .split(/\r?\n/)
    .filter((line, index, allLines) => index < allLines.length - 1 || line !== '')
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (!match || !(match[1] in updates)) {
        return line;
      }
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf-8');
}

await main();
