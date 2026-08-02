import { randomUUID } from 'node:crypto';
import { getDatabaseClient } from '@/lib/db';

export type PurchaseRequestStatus = 'pending_approval' | 'approved' | 'denied' | 'paid' | 'failed';

export type PurchaseRequest = {
  amountCents: number;
  category: string | null;
  createdAt: string;
  currency: string;
  decidedBy: string | null;
  id: string;
  imageDataUrl: string | null;
  item: string;
  orgId: string | null;
  quantity: number;
  rationale: string | null;
  requesterEmail: string | null;
  requesterUserId: string;
  status: PurchaseRequestStatus;
  stripePaymentIntentId: string | null;
  transcript: string | null;
  updatedAt: string;
};

let saysoSchemaPromise: Promise<void> | null = null;

async function ensureSaysoSchema() {
  if (!saysoSchemaPromise) {
    saysoSchemaPromise = (async () => {
      const sql = getDatabaseClient();

      await sql`
        create table if not exists purchase_requests (
          id text primary key,
          org_id text,
          requester_user_id text not null,
          requester_email text,
          transcript text,
          item text not null,
          quantity integer not null default 1,
          amount_cents integer not null,
          currency text not null default 'usd',
          category text,
          rationale text,
          image_data_url text,
          status text not null default 'pending_approval',
          stripe_payment_intent_id text,
          decided_by text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;

      await sql`
        create index if not exists purchase_requests_org_status_idx
        on purchase_requests (org_id, status, created_at desc)
      `;
    })().catch((error) => {
      saysoSchemaPromise = null;
      throw error;
    });
  }

  await saysoSchemaPromise;
}

function asRecord(value: unknown) {
  return (value ?? {}) as Record<string, unknown>;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function mapPurchaseRequest(row: unknown): PurchaseRequest {
  const record = asRecord(row);

  return {
    amountCents: asNumber(record.amount_cents),
    category: asNullableString(record.category),
    createdAt: asString(record.created_at),
    currency: asString(record.currency) || 'usd',
    decidedBy: asNullableString(record.decided_by),
    id: asString(record.id),
    imageDataUrl: asNullableString(record.image_data_url),
    item: asString(record.item),
    orgId: asNullableString(record.org_id),
    quantity: asNumber(record.quantity) || 1,
    rationale: asNullableString(record.rationale),
    requesterEmail: asNullableString(record.requester_email),
    requesterUserId: asString(record.requester_user_id),
    status: (asString(record.status) || 'pending_approval') as PurchaseRequestStatus,
    stripePaymentIntentId: asNullableString(record.stripe_payment_intent_id),
    transcript: asNullableString(record.transcript),
    updatedAt: asString(record.updated_at),
  };
}

export async function createPurchaseRequest(input: {
  amountCents: number;
  category: string | null;
  imageDataUrl: string | null;
  item: string;
  orgId: string | null;
  quantity: number;
  rationale: string | null;
  requesterEmail: string | null;
  requesterUserId: string;
  transcript: string | null;
}) {
  await ensureSaysoSchema();

  const sql = getDatabaseClient();
  const rows = (await sql`
    insert into purchase_requests (
      id,
      org_id,
      requester_user_id,
      requester_email,
      transcript,
      item,
      quantity,
      amount_cents,
      category,
      rationale,
      image_data_url
    )
    values (
      ${randomUUID()},
      ${input.orgId},
      ${input.requesterUserId},
      ${input.requesterEmail},
      ${input.transcript},
      ${input.item},
      ${input.quantity},
      ${input.amountCents},
      ${input.category},
      ${input.rationale},
      ${input.imageDataUrl}
    )
    returning *
  `) as Array<Record<string, unknown>>;

  return mapPurchaseRequest(rows[0]);
}

/**
 * Inside an organization you see that organization's cart — that is the whole
 * multi-tenant point.
 *
 * Outside one you see only your OWN rows. The previous version returned every
 * row in the table when `orgId` was null, which was invisible while the only
 * signed-in user was the owner, and a cross-tenant leak the moment anyone else
 * signed in. `requesterUserId` is required for that reason: no org and no user
 * means no rows, never everything.
 */
export async function listPurchaseRequests(filter: {
  orgId: string | null;
  requesterUserId: string | null;
  status?: PurchaseRequestStatus;
}) {
  await ensureSaysoSchema();

  const sql = getDatabaseClient();
  const rows = (filter.status
    ? await sql`
        select * from purchase_requests
        where (
          (${filter.orgId}::text is not null and org_id = ${filter.orgId})
          or (${filter.orgId}::text is null and org_id is null
              and ${filter.requesterUserId}::text is not null
              and requester_user_id = ${filter.requesterUserId})
        )
          and status = ${filter.status}
        order by created_at desc
        limit 50
      `
    : await sql`
        select * from purchase_requests
        where (
          (${filter.orgId}::text is not null and org_id = ${filter.orgId})
          or (${filter.orgId}::text is null and org_id is null
              and ${filter.requesterUserId}::text is not null
              and requester_user_id = ${filter.requesterUserId})
        )
        order by created_at desc
        limit 50
      `) as Array<Record<string, unknown>>;

  return rows.map(mapPurchaseRequest);
}

export async function getPurchaseRequest(id: string) {
  await ensureSaysoSchema();

  const sql = getDatabaseClient();
  const rows = (await sql`
    select * from purchase_requests where id = ${id} limit 1
  `) as Array<Record<string, unknown>>;

  return rows[0] ? mapPurchaseRequest(rows[0]) : null;
}

export async function decidePurchaseRequest(input: {
  decidedBy: string;
  id: string;
  status: PurchaseRequestStatus;
  stripePaymentIntentId?: string | null;
}) {
  await ensureSaysoSchema();

  const sql = getDatabaseClient();
  const rows = (await sql`
    update purchase_requests
    set
      status = ${input.status},
      decided_by = ${input.decidedBy},
      stripe_payment_intent_id = coalesce(${input.stripePaymentIntentId ?? null}, stripe_payment_intent_id),
      updated_at = now()
    where id = ${input.id}
    returning *
  `) as Array<Record<string, unknown>>;

  return rows[0] ? mapPurchaseRequest(rows[0]) : null;
}
