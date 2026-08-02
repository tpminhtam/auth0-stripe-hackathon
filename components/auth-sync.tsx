'use client';

import { useEffect, useRef } from 'react';
import posthog from 'posthog-js';

export function AuthSync() {
  const lastSyncedUserID = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch('/auth/profile', { credentials: 'same-origin' })
      .then(async (profileResponse) => {
        if (cancelled || !profileResponse.ok) {
          return;
        }

        const profile = (await profileResponse.json()) as { sub?: string };
        if (!profile.sub || lastSyncedUserID.current === profile.sub) {
          return;
        }

        lastSyncedUserID.current = profile.sub;

        const syncResponse = await fetch('/auth/sync', {
          credentials: 'same-origin',
          method: 'POST',
        });

        if (!syncResponse.ok) {
          return;
        }

        const payload = (await syncResponse.json()) as { userId?: string };

        if (payload.userId) {
          posthog.identify(payload.userId);
        }

        posthog.capture('user_signed_in');
      })
      .catch(() => {
        lastSyncedUserID.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
