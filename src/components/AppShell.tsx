// App frame: aguayo stripe + top bar, main column, bottom nav (phone) or sidebar (desktop),
// floating action button and the ¿Alguien sabe? conversation panel (desktop only).
// It holds no data of its own: ShellLayout (SPEC 04) passes everything in and renders the route.
import { useEffect, useState, type ReactNode } from 'react';
import { CITIES, useRefresh, type City } from '../data';
import { BellIcon, ChevronDownIcon, HomeIcon, PlusIcon, QuestionIcon, SearchIcon, UserIcon } from './icons';
import { OfflineBanner } from './OfflineBanner';
import { Yapita } from './Yapita';
import './app-shell.css';

export type Tab = 'hoy' | 'preguntas' | 'yo';

/** Desktop layout per tab (wiki #141, #145): one frame width on every tab; ¿Alguien sabe?
 * divides it into list + conversation. Phones always show one column. */
const LAYOUT: Record<Tab, 'wide' | 'split' | 'single'> = { hoy: 'wide', preguntas: 'split', yo: 'single' };

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'hoy', label: 'Hoy', Icon: HomeIcon },
  { id: 'preguntas', label: '¿Alguien sabe?', Icon: QuestionIcon },
  { id: 'yo', label: 'Yo', Icon: UserIcon },
];

/** The tab's main action, a verb and its object (none on Yo). */
const FAB_LABEL: Partial<Record<Tab, string>> = { hoy: 'Subir letrero', preguntas: 'Preguntar' };
/** The same action under the desktop rail's «+», where only one short word fits. */
const RAIL_LABEL: Partial<Record<Tab, string>> = { hoy: 'Subir', preguntas: 'Preguntar' };

/** Scrolling down this far (px, in one go) folds the FAB; scrolling up this far unfolds it. A shorter move,
 * a tremor of the finger or a bounce at the end of the list changes nothing, so the pill never flickers. */
const FOLD_AFTER = 48;
const UNFOLD_AFTER = 24;
const FOLD_MIN_Y = 120;

/** While the list scrolls down the FAB folds to its «+» so it covers less; it unfolds on the way up. */
function useFoldOnScroll(): boolean {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let anchor = last; // where the current direction started
    let direction = 0;
    const onScroll = () => {
      const y = window.scrollY;
      if (y === last) return;
      const now = y > last ? 1 : -1;
      if (now !== direction) {
        direction = now;
        anchor = last;
      }
      last = y;
      if (y <= FOLD_MIN_Y) setFolded(false); // at the top the full button is always there
      else if (direction > 0 && y - anchor >= FOLD_AFTER) setFolded(true);
      else if (direction < 0 && anchor - y >= UNFOLD_AFTER) setFolded(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return folded;
}

type AppShellProps = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  city: City;
  onCityChange: (city: City) => void;
  /** Signed-in only: unread notifications (bell) and confirmed balance (null while «★ …»). */
  account?: { unread: number; balance: number | null; onBell: () => void; onBalance: () => void };
  /** Signed out: «Entrar» in the top bar. */
  onSignIn?: () => void;
  onFab?: () => void;
  /** Lupa in the top bar (wiki #140): shown while the screen's own search is out of view. */
  onSearch?: () => void;
  /** Desktop conversation panel of ¿Alguien sabe?. Hidden on phones, where details are full screen. */
  detail?: ReactNode;
  /** What the empty panel says (it must match what the list offers). */
  detailEmpty?: string;
  children: ReactNode;
};

export function AppShell({ tab, onTabChange, city, onCityChange, account, onSignIn, onFab, onSearch, detail, detailEmpty, children }: AppShellProps) {
  const fabLabel = FAB_LABEL[tab];
  const folded = useFoldOnScroll();
  const refresh = useRefresh();

  // Another tab: the layout navigates (animated, landing at the top). The current tab again: back to the top and
  // fetch it again, so what others published shows up, also on a computer (wiki #181)
  const goTo = (next: Tab) => {
    if (next === tab) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      refresh(tab === 'hoy' ? 'signs' : tab === 'preguntas' ? 'questions' : 'me');
      return;
    }
    onTabChange(next);
  };

  return (
    <div className="shell" data-layout={LAYOUT[tab]}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <aside className="shell__sidebar" aria-label="Menú">
        <div className="shell__brand">
          <img src="/logo.svg" alt="" width={40} height={40} />
          <span className="shell__label">BoliviaSabe</span>
        </div>
        <TabList tab={tab} onTabChange={goTo} />
        {fabLabel && onFab && (
          <button type="button" className="btn btn--full shell__side-action" aria-label={fabLabel} onClick={onFab}>
            <PlusIcon size={20} /> <span className="shell__label">{fabLabel}</span>
            <span className="shell__rail-label" aria-hidden="true">{RAIL_LABEL[tab]}</span>
          </button>
        )}
      </aside>

      <div className="shell__column">
        <header className="shell__top">
          <div className="aguayo" />
          <div className="shell__bar">
            <img className="shell__logo" src="/logo.svg" alt="BoliviaSabe" width={32} height={32} />
            {/* Visible name + transparent native select on top: the phone's own picker, sized to the text */}
            <label className="shell__city">
              <span className="shell__city-name" aria-hidden="true">{city}</span>
              <ChevronDownIcon size={16} />
              <select aria-label={`Ciudad: ${city}`} value={city} onChange={(e) => onCityChange(e.target.value as City)}>
                {CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="shell__account">
              <button type="button" className="icon-btn shell__search" aria-label="Buscar" data-shown={onSearch ? 'true' : undefined} onClick={onSearch}>
                <SearchIcon />
              </button>
              {account && (
                <>
                  <button
                    type="button"
                    className="icon-btn shell__bell"
                    onClick={account.onBell}
                    aria-label={account.unread > 0 ? `Avisos, ${account.unread} sin leer` : 'Avisos'}
                  >
                    <BellIcon />
                    {account.unread > 0 && <span className="shell__badge" aria-hidden="true">{account.unread > 9 ? '9+' : account.unread}</span>}
                  </button>
                  {/* On Yo the profile card already shows the balance: never twice on one screen */}
                  {tab !== 'yo' && (
                    <button type="button" className="shell__balance" onClick={account.onBalance} aria-label={`Tienes ${account.balance ?? '…'} yapitas, ver movimientos`}>
                      <Yapita />
                      {account.balance === null ? <span className="num-wait" aria-hidden="true" /> : <span>{account.balance}</span>}
                    </button>
                  )}
                </>
              )}
              {!account && onSignIn && tab !== 'yo' && (
                <button type="button" className="btn btn--secondary btn--small shell__signin" onClick={onSignIn}>
                  <UserIcon className="shell__signin-icon" size={20} />
                  <span className="shell__signin-text">Entrar</span>
                </button>
              )}
            </div>
          </div>
          <OfflineBanner />
        </header>

        <main id="contenido" className="shell__main" tabIndex={-1}>
          {children}
        </main>

        {fabLabel && onFab && (
          <button type="button" className="btn shell__fab" data-folded={folded || undefined} aria-label={fabLabel} onClick={onFab}>
            <PlusIcon size={20} /> <span className="shell__fab-label">{fabLabel}</span>
          </button>
        )}

        <nav className="shell__nav" aria-label="Principal">
          <TabList tab={tab} onTabChange={goTo} />
        </nav>
      </div>

      {/* Desktop only, ¿Alguien sabe? only (hidden on phones, where details open full screen) */}
      {LAYOUT[tab] === 'split' && (
        <section className="shell__detail" aria-label="Conversación">
          {detail ?? <p className="shell__detail-empty">{detailEmpty ?? 'Toca una pregunta para ver su conversación aquí.'}</p>}
        </section>
      )}
    </div>
  );
}

function TabList({ tab, onTabChange }: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <ul className="tabs">
      {TABS.map(({ id, label, Icon }) => (
        <li key={id}>
          <button
            type="button"
            className="tabs__item"
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTabChange(id)}
          >
            <span className="tabs__icon">
              <Icon />
            </span>
            <span className="tabs__label">{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
