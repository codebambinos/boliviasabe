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
