// The bell in the top bar (SPEC 24, wiki #216). When the unread number goes up, a new notice arrived: the bubble
// bounces, golden sparkles burst around it and the bell rings, in 5 cycles of 2 s (about 10 s). Going down plays nothing.
// The first count after signing in is not «new» (it is what was already waiting), so it does not celebrate.
// Everything is transform and opacity on small elements, keyed so each arrival replays it; off with reduced motion.
import { useEffect, useRef, useState } from 'react';
import { BellIcon } from './icons';

/** Counts that arrive this soon after the bell appears are the initial load, not a new notice. */
const SETTLE_MS = 2500;
const SPARKLES = 6;

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  const mountedAt = useRef(Date.now());
  const previous = useRef(unread);
  // Each new arrival bumps this; it keys the animated parts so they play again
  const [arrival, setArrival] = useState(0);

  useEffect(() => {
    const settled = Date.now() - mountedAt.current > SETTLE_MS;
    if (unread > previous.current && settled) setArrival((n) => n + 1);
    previous.current = unread;
  }, [unread]);

  const celebrating = arrival > 0;
  return (
    <button
      type="button"
      className="icon-btn shell__bell"
      onClick={onClick}
      aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
    >
      <span key={`bell-${arrival}`} className="shell__bell-icon" data-ring={celebrating || undefined}>
        <BellIcon />
      </span>
      {unread > 0 && (
        <span key={`badge-${arrival}`} className="shell__badge" data-new={celebrating || undefined} aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      {celebrating && unread > 0 && (
        <span key={`sparkles-${arrival}`} className="shell__sparkles" aria-hidden="true">
          {Array.from({ length: SPARKLES }, (_, i) => (
            <i key={i} style={{ ['--a' as string]: `${(360 / SPARKLES) * i + 15}deg` }} />
          ))}
        </span>
      )}
    </button>
  );
}
