// One-line hint the first time a tab opens (wiki › Entrada: «pistas de un renglón la primera vez en
// cada pestaña; se cierran con ✕ y no vuelven»). Remembered on this device only.
import { useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';
import { Yapita } from './Yapita';

const key = (id: string) => `bs-hint-${id}`;

function seen(id: string): boolean {
  try {
    return localStorage.getItem(key(id)) === '1';
  } catch {
    return false;
  }
}

export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(() => seen(id));
  if (hidden) return null;
  return (
    <p className="hint">
      <Yapita size="sm" />
      <span>{children}</span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Cerrar la pista"
        onClick={() => {
          try {
            localStorage.setItem(key(id), '1');
          } catch {
            /* private mode: the hint just comes back next time */
          }
          setHidden(true);
        }}
      >
        <CloseIcon size={18} />
      </button>
    </p>
  );
}
