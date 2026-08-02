import { NextResponse } from 'next/server';
import { isApproverForContext } from '@/lib/approver';
import { getServerAuthContext } from '@/lib/server-auth';
import { listPurchaseRequests, type PurchaseRequestStatus } from '@/lib/sayso-data';

const STATUSES: PurchaseRequestStatus[] = ['pending_approval', 'approved', 'denied', 'paid', 'failed'];

export async function GET(request: Request) {
  try {
    const authContext = await getServerAuthContext();
    if (!authContext.userId) {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }

    if (!(await isApproverForContext(authContext))) {
      return NextResponse.json({ error: 'Only approvers can view the approval inbox.' }, { status: 403 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = STATUSES.includes(statusParam as PurchaseRequestStatus)
      ? (statusParam as PurchaseRequestStatus)
      : undefined;

    // requesterUserId scopes the no-org case to this person's own rows —
    // without it, a signed-in stranger would see every cart in the table.
    const requests = await listPurchaseRequests({
      orgId: authContext.orgId,
      requesterUserId: authContext.userId,
      status,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to list requests.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
