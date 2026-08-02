import { auth0 } from '@/lib/auth0';

type SessionClaims = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export async function getServerAuthContext() {
  const session = auth0 ? await auth0.getSession() : null;
  const user = (session?.user ?? {}) as SessionClaims;

  return {
    email: asString(user.email),
    firstName: asString(user.given_name),
    fullName: asString(user.name),
    orgId: asString(user.org_id),
    sessionClaims: user,
    userId: asString(user.sub),
  };
}

export async function getServerCurrentUser() {
  const session = auth0 ? await auth0.getSession() : null;
  if (!session?.user) {
    return null;
  }

  const user = session.user as SessionClaims;

  return {
    firstName: asString(user.given_name),
    fullName: asString(user.name),
    imageUrl: asString(user.picture),
    primaryEmailAddress: { emailAddress: asString(user.email) },
  };
}
