'use client';

import posthog from 'posthog-js';

function LogOutIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 17H4a1 1 0 01-1-1V4a1 1 0 011-1h3M13 14l4-4-4-4M17 10H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoutButton() {
  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] text-dim transition-colors hover:bg-white/6 hover:text-mist"
      onClick={() => {
        posthog.capture('user_logged_out');
        posthog.reset();
        window.location.href = '/auth/logout';
      }}
    >
      <LogOutIcon className="h-4 w-4" />
      Log out
    </button>
  );
}
