// Sheet: the one overlay of the app (letrero detail, «Crea tu cuenta para seguir», Avisos).
// Phone: `page` covers the screen, `bottom` rises from the foot. Desktop: a window over a scrim.
// It owns the behavior every overlay needs (wiki › Transversal › Navegación, DESIGN.md):
// - Android back, Escape and the scrim close the top sheet first;
// - the page behind (and any sheet below) is inert, so focus and screen readers stay inside;
// - focus moves in on open and back to the opener on close; the page behind does not scroll.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './sheet.css';

type Entry = { el: HTMLElement; requestClose: (fromHistory: boolean) => void; covers?: boolean };
const stack: Entry[] = [];
let skipPops = 0;
const afterPop: (() => void)[] = [];

/** Runs `fn` once, right after the sheet that is closing has popped its history entry. */
export function afterSheetPop(fn: () => void): void {
  afterPop.push(fn);
}

if (typeof window !== 'undefined') {
  // Capture phase and stopImmediatePropagation: while a sheet is open, a pop only closes it. It never
  // reaches React Router or the slide-direction listener, so the screen behind does not re-navigate,
  // restore its scroll or flag a «back» transition that never happens.
  window.addEventListener(
    'popstate',
    (event) => {
      if (stack.length === 0) return;
      event.stopImmediatePropagation();
      if (skipPops > 0) skipPops -= 1;
      else stack[stack.length - 1]?.requestClose(true);
      afterPop.splice(0).forEach((fn) => fn());
    },
    true,
  );
}

/** How long a sheet takes to leave (--m-exit); toasts and «after the sheet closes» waits use the same value. */
export const EXIT_MS = 160;

function setBackgroundInert() {
  const root = document.getElementById('root');
  if (root) root.inert = stack.length > 0;
  stack.forEach((entry, i) => {
    entry.el.inert = i < stack.length - 1;
  });
  document.documentElement.style.overflow = stack.length > 0 ? 'hidden' : '';
  // A full-screen sheet on a phone hides the page under it once it has arrived: with the keyboard open, iOS can
  // scroll the screen past the sheet, and the page behind (the list of questions) showed through
  if (root) {
    if (stack.some((entry) => entry.covers)) root.dataset.covered = '';
    else delete root.dataset.covered;
  }
}

type SheetProps = {
  /** id of the visible title inside the sheet */
  labelledBy: string;
  variant?: 'page' | 'bottom';
  onClose: () => void;
  /** Asked before any close (button, Escape, scrim, Android back). Return false to stay open,
   *  e.g. to ask «¿Descartar el letrero?» first. `forceClose` (2nd child argument) skips it. */
  canClose?: () => boolean;
  className?: string;
  children: (close: () => void, forceClose: () => void) => ReactNode;
};

export function Sheet({ labelledBy, variant = 'page', onClose, canClose, className, children }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const entryRef = useRef<Entry | null>(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const canCloseRef = useRef(canClose);
  canCloseRef.current = canClose;

  const requestClose = (fromHistory: boolean, force = false) => {
    if (closingRef.current) return;
    if (!force && canCloseRef.current && !canCloseRef.current()) {
      // Android back already popped our entry: put it back so the next back still lands here
      if (fromHistory) {
        window.history.pushState({ sheet: true }, '');
        pushed.current = true;
      }
      return;
    }
    closingRef.current = true;
    if (!fromHistory && pushed.current) {
      skipPops += 1;
      window.history.back();
    }
    pushed.current = false;
    setClosing(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => onCloseRef.current(), reduced ? 0 : EXIT_MS);
  };
  const requestRef = useRef(requestClose);
  requestRef.current = requestClose;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!pushed.current) {
      window.history.pushState({ sheet: true }, '');
      pushed.current = true;
    }
    const entry: Entry = { el, requestClose: (fromHistory) => requestRef.current(fromHistory) };
    entryRef.current = entry;
    stack.push(entry);
    setBackgroundInert();
    // Once the sheet has finished rising (260 ms), the page under a full-screen phone sheet is hidden
    const cover =
      variant === 'page' && window.matchMedia('(max-width: 63.99rem)').matches
        ? window.setTimeout(() => {
            entry.covers = true;
            setBackgroundInert();
          }, 300)
        : undefined;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === entry) entry.requestClose(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(cover);
      document.removeEventListener('keydown', onKey);
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      setBackgroundInert();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // On the way out the page is back at once, so the sheet leaves over the screen it came from
  useEffect(() => {
    if (!closing || !entryRef.current?.covers) return;
    entryRef.current.covers = false;
    setBackgroundInert();
  }, [closing]);

  const close = () => requestClose(false);
  const forceClose = () => requestClose(false, true);

  return createPortal(
    <div ref={host} className={`sheet ${className ?? ''}`} data-variant={variant} data-closing={closing || undefined}>
      <div className="sheet__scrim" onClick={close} aria-hidden="true" />
      <div ref={panel} className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children(close, forceClose)}
      </div>
    </div>,
    document.body,
  );
}
