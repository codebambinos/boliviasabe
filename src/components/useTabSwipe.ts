// Phones only: drag the screen sideways to change tab (Hoy ↔ ¿Alguien sabe? ↔ Yo). The content follows the finger;
// let go far or fast enough and it slides out to that side while the next tab slides in from the other one. Past the
// first or the last tab there is nowhere to go: the content stretches a little toward the finger and springs back.
//
// Kept smooth on purpose: `touch-action: pan-y` (app-shell.css) gives the sideways drag to us from the first move, so
// the browser never starts scrolling under the finger; the pointer is captured once the drag is sideways; styles are
// written once per frame; the tab change is our own short slide (Web Animations), not a View Transition, so the
// screen never freezes or ignores the next swipe.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Movement (px) before deciding whether the gesture is sideways (a swipe) or vertical (a scroll). */
const SLOP = 8;
/** The phone's own back gesture lives at the screen edges: a touch starting there is left to it. */
const EDGE = 20;
/** Let go past this share of the width, or with a flick, and the tab changes. */
const COMMIT = 0.25;
const FLICK_SPEED = 0.35; // px per ms, measured over the last 100 ms
const FLICK_MIN = 30; // px
/** Rubber band at the ends: how far the content may move (px) and stretch (share of its width). */
const BAND_SHIFT = 36;
const BAND_STRETCH = 0.05;
/** Where a sideways drag already means something else, or a tap must stay a tap (tab bar, main button). */
const IGNORE = 'input, textarea, select, .chip-scroller, .shell__nav, .shell__fab, [data-no-swipe]';
const PHONE = '(max-width: 63.99rem) and (pointer: coarse)';

const OUT_MS = 140;
const IN_MS = 240;
const BACK_MS = 320;
const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)';
const EASE_IN = 'cubic-bezier(0.22, 1, 0.36, 1)';
// Released half-way, the screen settles back with --ease-enter: no overshoot (DESIGN.md › Motion, SPEC 27)
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clear(el: HTMLElement) {
  el.getAnimations().forEach((a) => a.cancel());
  el.style.transform = '';
  el.style.transformOrigin = '';
  el.style.opacity = '';
  el.style.willChange = '';
}

/**
 * `surface` listens to the finger: the whole column, so a short screen (Yo signed out) also swipes from its empty
 * part. `target` is what moves: the content. `go(next)` must change the tab without an animation of its own: the
 * hook plays the slide. Tab changes from anywhere else (the tab bar) also leave the content clean.
 */
export function useTabSwipe<T extends string>(
  surface: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  tabs: readonly T[],
  tab: T,
  go: (next: T) => void,
): void {
  const goRef = useRef(go);
  goRef.current = go;
  /** Side the next tab enters from (+1 right, −1 left), set when a swipe commits. */
  const enterFrom = useRef<number | null>(null);

  // A new tab: start clean and, after a swipe, slide in from the other side
  useLayoutEffect(() => {
    const el = target.current;
    if (!el) return;
    clear(el);
    const side = enterFrom.current;
    enterFrom.current = null;
    if (side === null || reducedMotion()) return;
    el.animate(
      [
        { transform: `translateX(${side * Math.round(window.innerWidth * 0.3)}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: IN_MS, easing: EASE_IN },
    );
  }, [target, tab]);

  useEffect(() => {
    const el = target.current;
    const area = surface.current;
    if (!el || !area) return;
    const index = tabs.indexOf(tab);
    const neighbor = (delta: number): T | undefined => (delta < 0 ? tabs[index + 1] : tabs[index - 1]);

    let tracking = false;
    let swiping = false;
    let leaving = false;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let frame = 0;
    let samples: { x: number; t: number }[] = [];

    const paint = () => {
      frame = 0;
      const width = window.innerWidth;
      if (neighbor(dx) !== undefined) {
        el.style.transformOrigin = '';
        el.style.transform = `translate3d(${dx}px, 0, 0)`;
        el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / width) * 0.35);
      } else {
        // Rubber band: the further the pull, the less it gives (0 → 1, never reached)
        const pull = 1 - 1 / ((Math.abs(dx) / width) * 3 + 1);
        el.style.transformOrigin = dx > 0 ? 'left center' : 'right center';
        el.style.transform = `translate3d(${Math.sign(dx) * pull * BAND_SHIFT}px, 0, 0) scaleX(${1 + pull * BAND_STRETCH})`;
        el.style.opacity = '';
      }
    };

    // Back to rest from wherever the finger left it, with a small overshoot
    const settle = () => {
      const from = { transform: el.style.transform || 'none', opacity: el.style.opacity || '1', transformOrigin: el.style.transformOrigin || 'center' };
      clear(el);
      if (from.transform === 'none' || reducedMotion()) return;
      el.animate([from, { transform: 'none', opacity: 1, transformOrigin: from.transformOrigin }], { duration: BACK_MS, easing: SETTLE });
    };

    // Pointer events, not touch events: a touch stays tied to the element it started on, and when that element is
    // re-rendered away mid-drag (a list that finishes loading) the rest of the gesture was lost. Once the drag is
    // sideways the pointer is captured by the content itself, so nothing under the finger can swallow it.
    let pointer: number | null = null;

    const onDown = (e: PointerEvent) => {
      tracking = false;
      swiping = false;
      if (e.pointerType !== 'touch' || !e.isPrimary || leaving || !window.matchMedia(PHONE).matches) return;
      // A sheet open over the screen (Sheet.tsx locks the page)
      if (document.documentElement.style.overflow === 'hidden') return;
      if (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
      if (e.target instanceof Element && e.target.closest(IGNORE)) return;
      tracking = true;
      pointer = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      samples = [{ x: e.clientX, t: e.timeStamp }];
    };

    const onMove = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointer) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!swiping) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Mostly vertical: a scroll (or the pull-to-refresh), not ours
        if (Math.abs(dy) >= Math.abs(dx)) {
          tracking = false;
          return;
        }
        swiping = true;
        try {
          area.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone: the up/cancel below ends the gesture
        }
        // Whatever was still settling or sliding in stops where it is; the finger takes over
        el.getAnimations().forEach((a) => a.cancel());
        el.style.willChange = 'transform, opacity';
        // Start from the finger, not from the slop: no jump on the first frame
        startX += Math.sign(dx) * SLOP;
        dx = e.clientX - startX;
      }
      samples.push({ x: e.clientX, t: e.timeStamp });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onUp = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointer) return;
      tracking = false;
      pointer = null;
      if (!swiping) return;
      swiping = false;
      if (frame) {
        cancelAnimationFrame(frame);
        paint();
      }
      const first = samples[0];
      const last = samples[samples.length - 1];
      const speed = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
      const next = neighbor(dx);
      const far = Math.abs(dx) > window.innerWidth * COMMIT;
      // A flick counts only in the direction of the drag
      const flick = Math.abs(speed) > FLICK_SPEED && Math.sign(speed) === Math.sign(dx) && Math.abs(dx) > FLICK_MIN;
      if (next === undefined || !(far || flick)) {
        settle();
        return;
      }
      const side = Math.sign(dx);
      if (reducedMotion()) {
        clear(el);
        goRef.current(next);
        return;
      }
      // Out to the finger's side, then the next tab comes in from the other one (useLayoutEffect above)
      leaving = true;
      const from = { transform: el.style.transform, opacity: el.style.opacity || '1' };
      const out = el.animate([from, { transform: `translate3d(${side * window.innerWidth * 0.5}px, 0, 0)`, opacity: 0 }], {
        duration: OUT_MS,
        easing: EASE_OUT,
        fill: 'forwards',
      });
      out.onfinish = () => {
        leaving = false;
        enterFrom.current = -side;
        goRef.current(next);
      };
      out.oncancel = () => {
        leaving = false;
      };
    };

    // The browser took the gesture (a vertical scroll started) or the touch was interrupted
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (swiping) settle();
      tracking = false;
      swiping = false;
      pointer = null;
    };

    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerup', onUp);
    area.addEventListener('pointercancel', onCancel);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      area.removeEventListener('pointerdown', onDown);
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerup', onUp);
      area.removeEventListener('pointercancel', onCancel);
    };
  }, [surface, target, tabs, tab]);
}
