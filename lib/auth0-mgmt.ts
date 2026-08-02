const mgmtDomain = process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN;
const mgmtClientId = process.env.AUTH0_MGMT_CLIENT_ID;
const mgmtClientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;

export const mgmtConfigured = Boolean(mgmtDomain && mgmtClientId && mgmtClientSecret);

let cachedToken: { expiresAt: number; token: string } | null = null;

async function getMgmtToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(`https://${mgmtDomain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: mgmtClientId,
      client_secret: mgmtClientSecret,
      audience: `https://${mgmtDomain}/api/v2/`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Management token request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    expiresAt: Date.now() + payload.expires_in * 1000,
    token: payload.access_token,
  };
  return payload.access_token;
}

async function mgmtGet<T>(path: string): Promise<T> {
  const token = await getMgmtToken();
  const response = await fetch(`https://${mgmtDomain}/api/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Management API GET ${path} failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

type OrgRole = { id: string; name: string };

const roleCache = new Map<string, { expiresAt: number; roles: OrgRole[] }>();

export async function getOrgRolesForUser(orgId: string, userId: string): Promise<OrgRole[]> {
  const cacheKey = `${orgId}:${userId}`;
  const cached = roleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.roles;
  }

  const roles = await mgmtGet<OrgRole[]>(
    `organizations/${orgId}/members/${encodeURIComponent(userId)}/roles?per_page=50`,
  );
  roleCache.set(cacheKey, { expiresAt: Date.now() + 60_000, roles });
  return roles;
}
