/** Loupe mark: a jeweler's aperture — lens ring, focus dot, blade ticks. */
export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="url(#loupe-ring)" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.4" fill="url(#loupe-core)" />
      <g stroke="url(#loupe-ring)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
        <path d="M12 3v3.2" />
        <path d="M19.8 16.5l-2.8-1.6" />
        <path d="M4.2 16.5l2.8-1.6" />
      </g>
      <defs>
        <linearGradient id="loupe-ring" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8ceeff" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
        <linearGradient id="loupe-core" x1="9" y1="9" x2="15" y2="15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5ce1ff" />
          <stop offset="1" stopColor="#22a7cc" />
        </linearGradient>
      </defs>
    </svg>
  );
}
