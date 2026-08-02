'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Org = { id: string; label: string };

export function OrgSwitcher() {
  const pathname = usePathname() ?? '/request';
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      fetch('/api/orgs', { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : { orgs: [] }))
        .catch(() => ({ orgs: [] })),
      fetch('/auth/profile', { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ]).then(([orgsPayload, profile]) => {
      if (cancelled) {
        return;
      }
      setOrgs((orgsPayload as { orgs: Org[] }).orgs ?? []);
      const claims = (profile ?? {}) as { org_id?: string; sub?: string };
      setSignedIn(Boolean(claims.sub));
      setCurrentOrgId(typeof claims.org_id === 'string' ? claims.org_id : null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (orgs.length === 0) {
    return null;
  }

  const switchTo = (orgId: string | null) => {
    const target = orgId
      ? `/auth/login?organization=${encodeURIComponent(orgId)}&returnTo=${encodeURIComponent(pathname)}`
      : `/auth/login?returnTo=${encodeURIComponent(pathname)}`;
    window.location.assign(target);
  };

  const pill = (active: boolean) =>
    `relative cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-300 ${
      active
        ? 'bg-white/10 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
        : 'text-dim hover:text-mist'
    }`;

  return (
    <div className="anim-rise-sm mb-4 flex flex-wrap items-center gap-2.5">
      <span className="eyebrow text-dim">Workspace</span>
      <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-white/8 bg-white/3 p-1">
        <button type="button" className={pill(signedIn && !currentOrgId)} onClick={() => switchTo(null)}>
          Personal
        </button>
        {orgs.map((org) => (
          <button key={org.id} type="button" className={pill(currentOrgId === org.id)} onClick={() => switchTo(org.id)}>
            {org.label}
          </button>
        ))}
      </div>
    </div>
  );
}
