/**
 * Category glyphs.
 *
 * Each is a small inline SVG with one animated part, so a category is
 * recognisable at a glance rather than read word by word. They are decorative
 * and marked aria-hidden — every one sits beside a real text label.
 */

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'glyph',
  'aria-hidden': true,
};

function Functional() {
  return (
    <svg {...BASE}>
      <path d="M4 12.5 9 17.5 20 6.5" className="trace" />
    </svg>
  );
}

function Ui() {
  return (
    <svg {...BASE}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
      <circle cx="6" cy="6.5" r="0.9" fill="currentColor" stroke="none" className="pulse" />
    </svg>
  );
}

function Design() {
  return (
    <svg {...BASE}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9" cy="9.5" r="1.5" fill="currentColor" stroke="none" className="pulse" />
      <circle cx="15.5" cy="12" r="1.5" fill="currentColor" stroke="none" className="pulse" style={{ animationDelay: '0.6s' }} />
      <circle cx="10.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" className="pulse" style={{ animationDelay: '1.2s' }} />
    </svg>
  );
}

function Accessibility() {
  return (
    <svg {...BASE}>
      <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M5 9h14" />
      <path d="M12 9v5m0 0-3.5 6M12 14l3.5 6" className="trace" />
    </svg>
  );
}

function SecurityPassive() {
  return (
    <svg {...BASE}>
      <path d="M12 3 20 6.5v5c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5v-5L12 3Z" />
      <path d="M8.5 12 11 14.5 15.5 10" className="trace" />
    </svg>
  );
}

function SecurityActive() {
  return (
    <svg {...BASE}>
      <path d="M12 3 20 6.5v5c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5v-5L12 3Z" />
      <circle cx="12" cy="12" r="2.6" className="pulse" />
    </svg>
  );
}

function Performance() {
  return (
    <svg {...BASE}>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16 16 10" className="spin" style={{ transformOrigin: '12px 16px' }} />
      <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Api() {
  return (
    <svg {...BASE}>
      <path d="M8 7 3.5 12 8 17" className="trace" />
      <path d="M16 7l4.5 5L16 17" className="trace" style={{ animationDelay: '0.35s' }} />
      <path d="M13.5 5.5 10.5 18.5" />
    </svg>
  );
}

function Unit() {
  return (
    <svg {...BASE}>
      <path d="M9 3v6.2L4.4 17.6A2 2 0 0 0 6.2 20.6h11.6a2 2 0 0 0 1.8-3L15 9.2V3" />
      <path d="M7.5 3h9" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" className="pulse" />
    </svg>
  );
}

function Strict() {
  return (
    <svg {...BASE}>
      <path d="M12 3.5 20 7v5.5c0 4.8-3.3 8-8 8.9-4.7-.9-8-4.1-8-8.9V7l8-3.5Z" />
      <path d="M12 8.5v4.5" />
      <circle cx="12" cy="16" r="0.95" fill="currentColor" stroke="none" />
    </svg>
  );
}

const GLYPHS: Record<string, () => React.JSX.Element> = {
  functional: Functional,
  ui: Ui,
  design: Design,
  accessibility: Accessibility,
  'security-passive': SecurityPassive,
  'security-active': SecurityActive,
  performance: Performance,
  api: Api,
  unit: Unit,
  strict: Strict,
};

export function Glyph({ id }: { id: string }) {
  const Component = GLYPHS[id] ?? Functional;
  return <Component />;
}

/** Header mark: concentric rings with a sweeping scan and intermittent blips. */
export function Radar() {
  return (
    <div className="radar" aria-hidden>
      <span className="ring" />
      <span className="ring" />
      <span className="ring" />
      <span className="sweep" />
      <span className="blip b1" />
      <span className="blip b2" />
      <span className="blip b3" />
    </div>
  );
}

/** Animated wordmark. Each character drops in, the second word keeps a live gradient. */
export function Wordmark() {
  const first = 'Webtest';
  const second = 'Scanner';
  let index = 0;

  return (
    <h1 className="wordmark">
      <span className="sr-only">Webtest Scanner</span>
      {[...first].map((ch, i) => (
        <span key={`a${i}`} className="ch" style={{ ['--i' as string]: index++ }} aria-hidden>{ch}</span>
      ))}
      <span className="ch gap" aria-hidden> </span>
      {[...second].map((ch, i) => (
        <span key={`b${i}`} className="ch accent" style={{ ['--i' as string]: index++ }} aria-hidden>{ch}</span>
      ))}
    </h1>
  );
}
