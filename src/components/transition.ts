// Smooth navigation with the View Transitions API (DESIGN.md › Motion).
// The DOM update runs inside the transition; browsers without the API, and people who ask for
// reduced motion, get the same update at once.
import { flushSync } from 'react-dom';

export type NavDirection = 'forward' | 'back' | 'up';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs `update` (a React state change) as an animated screen change. */
export function navigateWithTransition(update: () => void, direction: NavDirection = 'forward'): void {
  const run = () => flushSync(update);
  if (typeof document.startViewTransition !== 'function' || reducedMotion()) {
    run();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = direction;
  const transition = document.startViewTransition(run);
  transition.finished.finally(() => {
    if (root.dataset.nav === direction) delete root.dataset.nav;
  });
}
