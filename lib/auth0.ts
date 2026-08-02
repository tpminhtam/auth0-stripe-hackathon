import { Auth0Client } from '@auth0/nextjs-auth0/server';

const domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_CLIENT_DOMAIN;
const clientId = process.env.AUTH0_CLIENT_ID || process.env.AUTH0_CLIENT_CLIENT_ID;
const clientSecret = process.env.AUTH0_CLIENT_SECRET || process.env.AUTH0_CLIENT_CLIENT_SECRET;
const secret = process.env.AUTH0_SECRET;

export const auth0Configured = Boolean(domain && clientId && clientSecret && secret);

export const auth0 = auth0Configured
  ? new Auth0Client({
      appBaseUrl: process.env.APP_BASE_URL,
      clientId,
      clientSecret,
      domain,
      secret,
    })
  : null;
