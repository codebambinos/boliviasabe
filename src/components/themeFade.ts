// Light ↔ dark without a jump. Where the browser can (View Transitions), the whole page cross-fades from a
// picture of the old theme to the new one: text and ground change together, so the ink never passes through a
// mid-gray that is the same as the ground (what made the letters flicker with a per-color transition).
// Elsewhere the class `theme-fade` on <html> makes every color property transition (CSS in src/styles/app.css).
// Either way it lasts only for the moment of the change. With reduced motion the change is immediate.
const FADE_MS = 260;
let timer: number | undefined;

/** Runs `change` (the one that flips the theme) with the colors cross-fading. */
export function withThemeFade(change: () => void): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change();
    return;
  }
  const root = document.documentElement;

  if (typeof document.startViewTransition === 'function') {
    // The tab-change transitions name some elements (top bar, FAB…): none of them takes part in this one
    root.classList.add('theme-vt');
    const transition = document.startViewTransition(change);
    const done = () => root.classList.remove('theme-vt');
    transition.finished.then(done, done);
    return;
  }

  root.classList.add('theme-fade');
  change();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 60);
}

/**
 * Ajustes › Tema (SPEC 21): the new theme switches on like a light. A circle of the new theme grows from the option
 * that was tapped until it covers the screen. Browsers without View Transitions get the cross-fade above; reduced
 * motion gets the change at once.
 *
 * Smoothness: the whole animation is CSS (`html.theme-reveal` in app.css), so it starts on the very first frame of
 * the transition (no frame of the new theme before a script animation is attached) and only `clip-path` moves.
 * The circle's center and radius go in as custom properties, which the transition's pseudo-elements inherit.
 */
export function withThemeReveal(change: () => void, from: { x: number; y: number }): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change();
    return;
  }
  if (typeof document.startViewTransition !== 'function') {
    withThemeFade(change);
    return;
  }
  const root = document.documentElement;
  // Far enough to reach the farthest corner of the screen from the tapped point
  const radius = Math.ceil(Math.hypot(Math.max(from.x, window.innerWidth - from.x), Math.max(from.y, window.innerHeight - from.y)));
  root.style.setProperty('--reveal-x', `${Math.round(from.x)}px`);
  root.style.setProperty('--reveal-y', `${Math.round(from.y)}px`);
  root.style.setProperty('--reveal-r', `${radius}px`);
  root.classList.add('theme-vt', 'theme-reveal');
  const transition = document.startViewTransition(change);
  const done = () => {
    root.classList.remove('theme-vt', 'theme-reveal');
    for (const name of ['--reveal-x', '--reveal-y', '--reveal-r']) root.style.removeProperty(name);
  };
  transition.finished.then(done, done);
}
