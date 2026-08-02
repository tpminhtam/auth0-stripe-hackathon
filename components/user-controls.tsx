'use client';

import { useEffect, useState } from 'react';
import { buttonRow, secondaryButton } from '@/lib/ui';

type ProfileState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; name: string };

export function UserControls() {
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void fetch('/auth/profile', { credentials: 'same-origin' })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setProfile({ status: 'signed-out' });
          return;
        }

        const payload = (await response.json()) as { name?: string; email?: string };
        setProfile({ status: 'signed-in', name: payload.name ?? payload.email ?? 'Account' });
      })
      .catch(() => {
        if (!cancelled) {
          setProfile({ status: 'signed-out' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (profile.status === 'loading') {
    return null;
  }

  if (profile.status === 'signed-out') {
    return (
      <div className={buttonRow}>
        <a className={secondaryButton} href="/auth/login">
          Sign in
        </a>
        <a className={secondaryButton} href="/auth/login?screen_hint=signup">
          Create account
        </a>
      </div>
    );
  }

  return (
    <a className={secondaryButton} href="/dashboard">
      {profile.name}
    </a>
  );
}
