// Sheet: the one overlay of the app (letrero detail, «Crea tu cuenta para seguir», Avisos).
// Phone: `page` covers the screen, `bottom` rises from the foot. Desktop: a window over a scrim.
// It owns the behavior every overlay needs (wiki › Transversal › Navegación, DESIGN.md):
// - Android back, Escape and the scrim close the top sheet first;
// - the page behind (and any sheet below) is inert, so focus and screen readers stay inside;
// - focus moves in on open and back to the opener on close; the page behind does not scroll.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './sheet.css';

type Entry = { el: HTMLElement; requestClose: (fromHistory: boolean) => void };
const stack: Entry[] = [];
let skipPops = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (skipPops > 0) {
      skipPops -= 1;
      return;
    }
    stack[stack.length - 1]?.requestClose(true);
  });
}

const EXIT_MS = 160;

function setBackgroundInert() {
  const root = document.getElementById('root');
  if (root) root.inert = stack.length > 0;
  stack.forEach((entry, i) => {
    entry.el.inert = i < stack.length - 1;
  });
  document.documentElement.style.overflow = stack.length > 0 ? 'hidden' : '';
}

type SheetProps = {
  /** id of the visible title inside the sheet */
  labelledBy: string;
  variant?: 'page' | 'bottom';
  onClose: () => void;
  className?: string;
  children: (close: () => void) => ReactNode;
};

export function Sheet({ labelledBy, variant = 'page', onClose, className, children }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const requestClose = (fromHistory: boolean) => {
    if (closingRef.current) return;
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
    stack.push(entry);
    setBackgroundInert();
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && stack[stack.length - 1] === entry) entry.requestClose(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      setBackgroundInert();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  const close = () => requestClose(false);

  return createPortal(
    <div ref={host} className={`sheet ${className ?? ''}`} data-variant={variant} data-closing={closing || undefined}>
      <div className="sheet__scrim" onClick={close} aria-hidden="true" />
      <div ref={panel} className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
