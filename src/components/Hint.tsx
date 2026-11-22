// One-line hint the first time a tab opens (wiki › Entrada: «pistas de un renglón la primera vez en
// cada pestaña; se cierran con ✕ y no vuelven»). Remembered on this device only.
// On ✕ it fades and its row collapses, so the content below moves up instead of jumping; it is removed after that
// (SPEC 28, A5). The «seen» flag is saved at the tap.
import { useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { Yapita } from './Yapita';

const key = (id: string) => `bs-hint-${id}`;

/** If the collapse never reports its end (an old browser), the hint still goes. */
const REMOVE_FALLBACK_MS = 400;

function seen(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === '1';
  } catch {
    return false;
  }
}

export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => seen(id));
  const [closing, setClosing] = useState(false);
  if (hidden) return null;

  const close = () => {
    try {
      localStorage.setItem(key(id), '1');
    } catch {
      /* private mode: the hint just comes back next time */
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHidden(true);
      return;
    }
    setClosing(true);
    window.setTimeout(() => setHidden(true), REMOVE_FALLBACK_MS);
  };

  return (
    <div
      className="hint-slot"
      data-closing={closing || undefined}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setHidden(true);
      }}
    >
      <div className="hint-slot__clip">
        <p className="hint">
          <Yapita size="sm" />
          <span>{children}</span>
          <button type="button" className="icon-btn" aria-label="Cerrar la pista" disabled={closing} onClick={close}>
            <CloseIcon size={18} />
          </button>
        </p>
      </div>
    </div>
  );
}
