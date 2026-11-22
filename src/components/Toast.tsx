// A short notice above the tab bar (wiki #167: «¡Publicado! Ganaste +1 yapita»). It rises in, leaves on
// its own after about 4 s (sliding down), and screen readers hear it through role="status".
// Drawn in <body> (a portal, like the sheets): inside .shell__main, a size container, `position: fixed` would be
// relative to the page content instead of the screen, and on a long page like Yo it ended up out of view.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EXIT_MS } from './Sheet';
import './toast.css';

const SHOW_MS = 4000;

type ToastProps = { message: ReactNode; onDone: () => void };

export function Toast({ message, onDone }: ToastProps) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const done = window.setTimeout(() => doneRef.current(), SHOW_MS + (reduced ? 0 : EXIT_MS));
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, []);

  return createPortal(
    <div className="toast" role="status" aria-live="polite" data-leaving={leaving || undefined}>
      <p className="toast__box">{message}</p>
    </div>,
    document.body,
  );
}
