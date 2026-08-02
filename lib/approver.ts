import { getOrgRolesForUser, mgmtConfigured } from '@/lib/auth0-mgmt';

function isApproverByEmail(email: string | null) {
  const configured = process.env.SAYSO_APPROVER_EMAILS;
  if (!configured || !configured.trim()) {
    return true;
  }

  if (!email) {
    return false;
  }

  return configured
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export async function isApproverForContext(context: {
  email: string | null;
  orgId: string | null;
  userId: string | null;
}) {
  if (context.orgId && context.userId && mgmtConfigured) {
    try {
      const roles = await getOrgRolesForUser(context.orgId, context.userId);
      return roles.some((role) => role.name === 'approver');
    } catch {
      return isApproverByEmail(context.email);
    }
  }

  return isApproverByEmail(context.email);
}
