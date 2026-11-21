// Light ↔ dark without a jump: while the class `theme-fade` is on <html>, every color property
// transitions (CSS in src/styles/app.css). It is on only for the moment of the change, so nothing else
// in the app animates colors. With reduced motion the change is immediate.
const FADE_MS = 260;
let timer: number | undefined;

/** Runs `change` (the one that flips the theme) with the colors cross-fading. */
export function withThemeFade(change: () => void): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change();
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-fade');
  change();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => root.classList.remove('theme-fade'), FADE_MS + 60);
}
