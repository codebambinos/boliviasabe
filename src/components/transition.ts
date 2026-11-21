// Smooth navigation with the View Transitions API (DESIGN.md › Motion).
// The DOM update runs inside the transition; browsers without the API, and people who ask for
// reduced motion, get the same update at once.
import { flushSync } from 'react-dom';

/** `remove`: not a screen change. Something leaves the screen in place (a deleted question). */
export type NavDirection = 'forward' | 'back' | 'up' | 'remove';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A route change (React Router) with the same fade-through. `go` receives whether to pass
 * `viewTransition: true` to `navigate`; React Router runs the transition and plays it again in
 * reverse on Back. Only the direction is set here.
 */
export function goWithTransition(go: (viewTransition: boolean) => void, direction: NavDirection = 'forward'): void {
  const animate = typeof document.startViewTransition === 'function' && !reducedMotion();
  if (animate) setDirection(direction);
  go(animate);
}

/** Direction of the next transition; it clears itself once the transition is over. */
export function setDirection(direction: NavDirection): void {
  const root = document.documentElement;
  root.dataset.nav = direction;
  window.setTimeout(() => {
    if (root.dataset.nav === direction) delete root.dataset.nav;
  }, 700);
}

/** Runs `update` (a React state change) as an animated screen change. Resolves once the animation is over. */
export function navigateWithTransition(update: () => void, direction: NavDirection = 'forward'): Promise<void> {
  const run = () => flushSync(update);
  if (typeof document.startViewTransition !== 'function' || reducedMotion()) {
    run();
    return Promise.resolve();
  }
  const root = document.documentElement;
  root.dataset.nav = direction;
  const transition = document.startViewTransition(run);
  return transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (root.dataset.nav === direction) delete root.dataset.nav;
    });
}
