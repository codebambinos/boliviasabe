// Yo › Avisos (SPEC 24, wiki #216): one row with the unread count that opens the same sheet as the bell.
// Between Mi actividad and Ajustes, the order in which flujo-final lists Yo.
import { useUnreadNotices } from '../data';
import { BellIcon, ChevronRightIcon } from './icons';

export function AvisosCard({ onOpen }: { onOpen: () => void }) {
  const unread = useUnreadNotices();
  const status = unread === 0 ? 'Al día' : unread === 1 ? '1 sin leer' : `${unread} sin leer`;
  return (
    <div className="card yo-grid__avisos">
      <ul className="rows rows--links rows--flush">
        <li>
          <button type="button" className="row__link" onClick={onOpen}>
            <BellIcon size={20} />
            <span className="row__main">
              Avisos
              {/* key: the count cross-fades when it changes */}
              <span key={status} className={unread > 0 ? 'meta row__sub avisos-card__count yo-fade' : 'meta row__sub yo-fade'}>
                {status}
              </span>
            </span>
            <ChevronRightIcon size={20} />
          </button>
        </li>
      </ul>
    </div>
  );
}
