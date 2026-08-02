import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth0 } from '@/lib/auth0';

export default async function proxy(request: NextRequest) {
  if (!auth0) {
    return NextResponse.next();
  }

  return auth0.middleware(request);
}

export const config = {
  matcher: ['/((?!_next|ingest|.*\\..*).*)', '/'],
};
