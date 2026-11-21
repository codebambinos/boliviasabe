// Pull-to-refresh indicator: a small round chip that slides out from under the top bar.
// The arrow turns with the pull, points up once releasing will refresh, then becomes a spinner.
// With reduced motion it does not move or spin: it appears in place with a short text.
import type { CSSProperties } from 'react';
import { PULL_THRESHOLD, type PullState } from './usePullToRefresh';
import './pull-to-refresh.css';

const TEXT: Record<Exclude<PullState, 'idle'>, string> = {
  pulling: 'Desliza para actualizar',
  armed: 'Suelta para actualizar',
  refreshing: 'Actualizando…',
};

export function PullIndicator({ state, distance }: { state: PullState; distance: number }) {
  const progress = Math.min(1, distance / PULL_THRESHOLD);
  const style = {
    '--ptr-y': `${distance}px`,
    '--ptr-turn': `${state === 'armed' ? 180 : progress * 180}deg`,
    '--ptr-alpha': state === 'idle' ? 0 : Math.max(0.35, progress),
  } as CSSProperties;

  return (
    <>
      <div className={`ptr ptr--${state}`} style={style} aria-hidden="true">
        <span className="ptr__chip">
          {state === 'refreshing' ? (
            <span className="ptr__spinner" />
          ) : (
            <svg className="ptr__arrow" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="m6 13 6 6 6-6" />
            </svg>
          )}
          {state !== 'idle' && <span className="ptr__text">{TEXT[state]}</span>}
        </span>
      </div>
      <p className="sr-only" role="status">
        {state === 'refreshing' ? 'Actualizando letreros…' : ''}
      </p>
    </>
  );
}
