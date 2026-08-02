const NODES = [
  { detail: 'leather crossbody', label: 'lens.scan', tone: 'beam' },
  { detail: 'usually $180 · 5 sources', label: 'agent.research', tone: 'beam' },
  { detail: '“yes, get it”', label: 'you.confirm', tone: 'beam' },
  { detail: 'over Personal $100', label: 'plan.check', tone: 'flare' },
  { detail: 'upgraded · pi_3Q… · +$0.50', label: 'stripe.charge', tone: 'jade' },
] as const;

const TONE_CLASS: Record<string, string> = {
  beam: 'flow-node-beam',
  flare: 'flow-node-flare',
  jade: 'flow-node-jade',
};

/**
 * One request, end to end. Pure CSS — each node lights in sequence on a shared
 * 8s loop while a pulse travels the rail beneath it.
 */
export function FlowRail() {
  return (
    <div className="panel anim-rise w-full overflow-hidden p-5 sm:p-6" style={{ '--d': '400ms' } as React.CSSProperties}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <span className="eyebrow text-dim">One request, end to end</span>
        <span className="eyebrow hidden text-beam/60 sm:inline">live pipeline</span>
      </div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-[4px] hidden h-px bg-gradient-to-r from-transparent via-white/14 to-transparent md:block" />
        <div className="flow-pulse absolute top-0 hidden h-2 w-2 rounded-full bg-beam shadow-[0_0_14px_3px_rgba(92,225,255,0.6)] md:block" />

        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5 md:gap-3">
          {NODES.map((node, index) => (
            <li
              key={node.label}
              className={`flow-node ${TONE_CLASS[node.tone]} relative flex items-start gap-3 md:block`}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="flow-dot mt-1 md:mt-0" />
              <div className="md:mt-4">
                <p className="font-mono text-[11.5px] font-medium tracking-tight text-ink/90">{node.label}</p>
                <p className="mt-1 text-[12px] leading-snug text-dim">{node.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
