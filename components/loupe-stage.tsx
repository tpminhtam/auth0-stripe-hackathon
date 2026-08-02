/**
 * The loupe: a lens that drifts across a field of things you might want, behind the
 * headline, brightening and magnifying what it passes over.
 *
 * Fixed 1100×640 px stage so the lens waypoints in `@keyframes loupe-path`
 * (globals.css) line up exactly with the item coordinates below — waypoint =
 * item − 90px, half the 180px lens. Each item's `--at` is the moment the lens
 * arrives (stop index × 22/6 = × 3.667s), as a delay into the shared 22s loop.
 *
 * Items ring the headline rather than sitting under it: the stage is behind the
 * hero content (z-0), so a tag that lands beneath the display type is invisible.
 * `tagLeft` is also kept ~100px clear of each item centre so the 180px lens body
 * never clips the start of the label.
 */

type Item = {
  at: string;
  icon: 'handbag' | 'bottle' | 'headphones' | 'sunglasses' | 'sneaker' | 'cup';
  tag: string;
  tagLeft: number;
  tone: 'ok' | 'over';
  x: number;
  y: number;
};

/*
 * Coordinates and `at` values are load-bearing — the lens waypoints in
 * @keyframes loupe-path are hard-coded to them (waypoint = item − 90px), so
 * moving an item here without moving its waypoint stops the lens landing on
 * anything. Icons, tags and tones are free to change; positions are not.
 *
 * Tags read as price RANGES because that is what the agent actually returns
 * once it has been to the market. Amber = the range clears the $100 cap, green
 * = it does not, which is the same colour language the lens chips use.
 */
const ITEMS: Item[] = [
  { at: '0s', icon: 'handbag', tag: 'leather crossbody · $180 – $400', tagLeft: 220, tone: 'over', x: 120, y: 95 },
  { at: '3.667s', icon: 'bottle', tag: 'insulated bottle · $18 – $45', tagLeft: 670, tone: 'ok', x: 975, y: 95 },
  { at: '7.333s', icon: 'headphones', tag: 'over-ear headphones · $150 – $250', tagLeft: 815, tone: 'over', x: 1010, y: 300 },
  { at: '11s', icon: 'sunglasses', tag: 'sunglasses · $25 – $70', tagLeft: 655, tone: 'ok', x: 900, y: 500 },
  { at: '14.667s', icon: 'sneaker', tag: 'sneakers · $90 – $220', tagLeft: 600, tone: 'over', x: 500, y: 545 },
  { at: '18.333s', icon: 'cup', tag: 'coffee · $4 – $9', tagLeft: 235, tone: 'ok', x: 135, y: 470 },
];

const ICONS: Record<Item['icon'], React.ReactNode> = {
  handbag: (
    <>
      <path d="M9 17h30l-3 25H12z" />
      <path d="M18 17v-4a6 6 0 0112 0v4" />
      <path d="M9 25h30" />
    </>
  ),
  bottle: (
    <>
      <path d="M20 5h8v6l3 5v25a3 3 0 01-3 3H20a3 3 0 01-3-3V16l3-5z" />
      <path d="M17 23h14" />
      <path d="M20 11h8" />
    </>
  ),
  headphones: (
    <>
      <path d="M9 31v-7a15 15 0 0130 0v7" />
      <rect x="5" y="28" width="9" height="15" rx="4" />
      <rect x="34" y="28" width="9" height="15" rx="4" />
    </>
  ),
  sunglasses: (
    <>
      <path d="M4 17h40" />
      <rect x="6" y="17" width="15" height="13" rx="6" />
      <rect x="27" y="17" width="15" height="13" rx="6" />
      <path d="M21 22h6" />
    </>
  ),
  sneaker: (
    <>
      <path d="M4 34h11l7-9 6 4h10a6 6 0 016 6v3H4z" />
      <path d="M15 34l3-4M22 25l5 6" />
    </>
  ),
  cup: (
    <>
      <path d="M12 12h24l-3 30H15z" />
      <path d="M10 12h28" />
      <path d="M14 22h20" />
    </>
  ),
};

export function LoupeStage() {
  return (
    <div className="loupe-stage" aria-hidden>
      <div className="loupe-field" />

      {ITEMS.map((item) => (
        <div key={item.icon}>
          <svg
            className="loupe-item"
            style={{ '--at': item.at, left: item.x - 28, top: item.y - 28 } as React.CSSProperties}
            width="56"
            height="56"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[item.icon]}
          </svg>
          <span
            className={`loupe-tag ${item.tone === 'over' ? 'loupe-tag-over' : 'loupe-tag-ok'}`}
            style={{ '--at': item.at, left: item.tagLeft, top: item.y - 10 } as React.CSSProperties}
          >
            {item.tag}
          </span>
        </div>
      ))}

      {/* Handle first on purpose: the glass and rim paint over where it meets
          the barrel, so it reads as attached rather than stuck on. */}
      <div className="loupe-lens">
        <div className="loupe-handle" />
        <div className="loupe-glass" />
        <div className="loupe-mag" />
        <div className="loupe-rim" />
      </div>
    </div>
  );
}
