'use client';

import { useState } from 'react';
import posthog from 'posthog-js';
import { primaryButton, mutedText } from '@/lib/ui';

export function CheckoutButton({
  interval = 'month',
  label = 'Start checkout',
  tier,
  variant = 'primary',
}: {
  interval?: 'month' | 'year';
  label?: string;
  tier?: 'starter' | 'team';
  variant?: 'ghost' | 'primary';
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    try {
      setLoading(true);
      setError(null);

      posthog.capture('checkout_started', { interval, tier: tier ?? 'default' });

      const response = await fetch('/api/checkout', {
        credentials: 'same-origin',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-POSTHOG-DISTINCT-ID': posthog.get_distinct_id(),
          'X-POSTHOG-SESSION-ID': posthog.get_session_id(),
        },
        body: JSON.stringify({ interval, tier }),
      });

      const payload = (await response.json()) as { error?: string; url?: string };
      if (response.status === 401) {
        window.location.assign('/sign-in?redirect_to=/checkout');
        return;
      }

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to create a checkout session.');
      }

      window.location.assign(payload.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to launch checkout.';
      posthog.captureException(err);
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className={variant === 'ghost' ? 'btn btn-ghost h-11 w-full text-[13px]' : `${primaryButton} w-full`}
        disabled={loading}
        onClick={handleCheckout}
      >
        {loading ? 'Creating session...' : label}
      </button>
      {error ? <p className={mutedText}>{error}</p> : null}
    </div>
  );
}
