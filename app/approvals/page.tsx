'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { ConsoleHeader } from '@/components/console-header';
import { OrgSwitcher } from '@/components/org-switcher';

type PurchaseRequest = {
  amountCents: number;
  category: string | null;
  createdAt: string;
  decidedBy: string | null;
  id: string;
  imageDataUrl: string | null;
  item: string;
  quantity: number;
  rationale: string | null;
  requesterEmail: string | null;
  status: string;
  stripePaymentIntentId: string | null;
};

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-jade/12 border-jade/35 text-jade',
  approved: 'bg-jade/12 border-jade/35 text-jade',
  denied: 'bg-white/5 border-white/12 text-dim',
  failed: 'bg-ember/12 border-ember/35 text-ember',
  pending_approval: 'bg-flare/12 border-flare/35 text-flare',
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeContext, setUpgradeContext] = useState<{ message: string; requestId: string } | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/requests', { credentials: 'same-origin' });
      if (response.status === 401) {
        setNeedsSignIn(true);
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { requests?: PurchaseRequest[] };
      setRequests(payload.requests ?? []);
    } catch {
      // keep last known list on transient failures
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const decide = useCallback(
    async (id: string, decision: 'approve' | 'deny') => {
      setDecidingId(id);
      setError(null);
      try {
        const response = await fetch('/api/requests/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, id }),
        });
        const payload = (await response.json()) as { error?: string; upgradeNeeded?: boolean };
        if (response.status === 402 && payload.upgradeNeeded) {
          setUpgradeContext({ message: payload.error ?? 'This purchase is over your plan limit.', requestId: id });
        } else if (!response.ok && payload.error) {
          setError(payload.error);
        }
        await refresh();
      } catch {
        setError('Network hiccup — try again.');
      } finally {
        setDecidingId(null);
      }
    },
    [refresh],
  );

  const upgradeAndApprove = useCallback(async () => {
    if (!upgradeContext) {
      return;
    }
    setUpgradeBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/upgrade', { credentials: 'same-origin', method: 'POST' });
      const payload = (await response.json()) as { error?: string; needsCheckout?: boolean; tier?: string };
      if (payload.needsCheckout) {
        window.location.assign('/checkout');
        return;
      }
      if (!response.ok) {
        setError(payload.error ?? 'Upgrade failed.');
        return;
      }
      const requestId = upgradeContext.requestId;
      setUpgradeContext(null);
      await decide(requestId, 'approve');
    } catch {
      setError('Network hiccup during upgrade — try again.');
    } finally {
      setUpgradeBusy(false);
    }
  }, [decide, upgradeContext]);

  if (needsSignIn) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="panel anim-rise w-full p-9">
          <BrandMark className="anim-float mx-auto h-10 w-10" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Sign in to review requests</h1>
          <p className="mt-2.5 text-sm leading-6 text-mist">
            Approving moves real money — Auth0 decides who is holding the pen.
          </p>
          <a className="btn btn-primary mt-7 h-12 w-full" href="/auth/login?returnTo=/approvals">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-4">
        <div className="panel anim-rise w-full p-9 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-flare/30 bg-flare/10 text-flare">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 10.5V7.8a4 4 0 018 0v2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <p className="eyebrow mt-6 text-flare">Role check · Auth0 Organizations</p>
          <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink">Only the cardholder can check out</h1>
          <p className="mt-3 text-sm leading-6 text-mist">
            Same account, different wallet — here you can add to the cart, but not check out. That right belongs to the
            organization, not the person.
          </p>

          <div className="mt-7 flex justify-center">
            <OrgSwitcher />
          </div>

          <Link className="btn btn-ghost mt-1 h-11 px-6" href="/request">
            &larr; Back to the lens
          </Link>
          <p className="mt-6 font-mono text-[11px] leading-relaxed text-dim">
            admins grant access via SAYSO_APPROVER_EMAILS
          </p>
        </div>
      </main>
    );
  }

  const pending = requests.filter((request) => request.status === 'pending_approval');
  const decided = requests.filter((request) => request.status !== 'pending_approval').slice(0, 8);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-20 pt-6 sm:px-6">
      <ConsoleHeader
        eyebrow="Loupe"
        title="Checkout"
        right={
          <span className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 sm:inline-flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${pending.length > 0 ? 'anim-blink bg-flare' : 'bg-jade'}`}
            />
            <span className="tabular font-mono text-[11px] tracking-tight text-mist">
              {pending.length} waiting
            </span>
          </span>
        }
      />

      <OrgSwitcher />

      {upgradeContext ? (
        <div className="panel-amber anim-breathe anim-rise mb-4 p-6">
          <p className="eyebrow inline-flex items-center gap-2 text-flare">
            <span className="anim-blink h-1.5 w-1.5 rounded-full bg-flare" />
            Blocked by your plan
          </p>
          <p className="mt-3 text-lg font-medium leading-7 text-ink">{upgradeContext.message}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={upgradeBusy}
              onClick={() => void upgradeAndApprove()}
              className="btn btn-primary h-11 px-6"
            >
              {upgradeBusy ? 'Upgrading…' : 'Upgrade & check out'}
            </button>
            <button type="button" onClick={() => setUpgradeContext(null)} className="btn btn-ghost h-11 px-6">
              Dismiss
            </button>
          </div>
          <p className="mt-4 font-mono text-[11px] text-flare/70">
            subscriptions.update → prorated invoice → the blocked request retries itself
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="panel-ember anim-rise-sm mb-4 px-4 py-3.5 text-sm leading-6 text-ember">{error}</p>
      ) : null}

      {pending.length === 0 ? (
        <section className="anim-rise flex flex-col items-center rounded-3xl border border-dashed border-white/12 bg-white/2 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/4 text-dim">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-9z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M3.5 8l8.5 5.5L20.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <p className="mt-4 text-[15px] font-medium text-mist">Cart is empty</p>
          <p className="mt-1.5 text-sm text-dim">Anything the agent sends lands here within seconds.</p>
        </section>
      ) : null}

      <div className="flex flex-col gap-4">
        {pending.map((request, index) => (
          <section
            key={request.id}
            className="panel lift anim-rise p-5 sm:p-6"
            style={{ '--d': `${index * 70}ms` } as React.CSSProperties}
          >
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="eyebrow inline-flex items-center gap-2 text-flare">
                  <span className="anim-blink h-1.5 w-1.5 rounded-full bg-flare" />
                  Awaiting your decision
                </p>
                <h2 className="mt-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                  {request.quantity} × {request.item}
                </h2>
                <p className="mt-2 text-sm leading-6 text-mist">{request.rationale}</p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {[request.requesterEmail ?? 'teammate', request.category ?? 'other'].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1.5 font-mono text-[11px] tracking-tight text-dim"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-3">
                <p className="tabular display text-[clamp(1.9rem,5vw,2.6rem)] text-ink">
                  {formatDollars(request.amountCents)}
                </p>
                {request.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Evidence"
                    className="h-20 w-20 shrink-0 rounded-xl border border-white/12 object-cover"
                    src={request.imageDataUrl}
                  />
                ) : null}
              </div>
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                disabled={decidingId === request.id}
                onClick={() => void decide(request.id, 'approve')}
                className="btn btn-jade h-11 flex-1"
              >
                {decidingId === request.id ? (
                  <span className="shimmer-text">Charging…</span>
                ) : (
                  'Check out & pay'
                )}
              </button>
              <button
                type="button"
                disabled={decidingId === request.id}
                onClick={() => void decide(request.id, 'deny')}
                className="btn btn-ghost h-11 flex-1"
              >
                Deny
              </button>
            </div>
          </section>
        ))}
      </div>

      {decided.length > 0 ? (
        <section className="anim-rise mt-9" style={{ '--d': '160ms' } as React.CSSProperties}>
          <div className="mb-3.5 flex items-center gap-3">
            <h2 className="eyebrow text-dim">Recent decisions</h2>
            <span className="h-px flex-1 bg-white/8" />
          </div>
          <div className="flex flex-col gap-2">
            {decided.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-sm transition-colors duration-300 hover:border-white/16"
              >
                <span className="min-w-0 truncate text-mist">
                  <span className="text-ink">
                    {request.quantity} × {request.item}
                  </span>
                  <span className="tabular ml-2 font-mono text-[13px]">
                    {formatDollars(request.amountCents)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${STATUS_STYLES[request.status] ?? STATUS_STYLES.denied}`}
                >
                  {request.status === 'paid'
                    ? `paid · ${request.stripePaymentIntentId?.slice(0, 11) ?? ''}`
                    : request.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
