import { NextResponse } from 'next/server';
import { appConfig } from '@/lib/app-config';
import { auth0Configured } from '@/lib/auth0';
import { databaseConfigured } from '@/lib/database-config';
import { twilioEmailConfigured } from '@/lib/twilio-config';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: appConfig.slug,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
    stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripePriceConfigured: Boolean(process.env.STRIPE_PRICE_ID),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    auth0Configured,
    databaseConfigured,
    twilioEmailConfigured,
  });
}
