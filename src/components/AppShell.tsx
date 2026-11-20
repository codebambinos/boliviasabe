// App frame: aguayo stripe + top bar, main column, bottom nav (phone) or sidebar (desktop),
// floating action button and an optional detail panel (desktop only).
// It holds no data of its own: screens and routes (T12) pass everything in.
import type { ReactNode } from 'react';
import { CITIES, type City } from '../data';
import { BellIcon, ChevronDownIcon, HomeIcon, PlusIcon, QuestionIcon, SearchIcon, UserIcon } from './icons';
import { navigateWithTransition } from './transition';
import './app-shell.css';

export type Tab = 'hoy' | 'preguntas' | 'yo';

/** Desktop layout per tab (wiki #141): Hoy a wide grid, ¿Alguien sabe? list + conversation panel,
 * Yo a single column. Phones always show one column. */
const LAYOUT: Record<Tab, 'wide' | 'split' | 'single'> = { hoy: 'wide', preguntas: 'split', yo: 'single' };

const TABS: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: 'hoy', label: 'Hoy', Icon: HomeIcon },
  { id: 'preguntas', label: '¿Alguien sabe?', Icon: QuestionIcon },
  { id: 'yo', label: 'Yo', Icon: UserIcon },
];

/** Floating button of each tab (none on Yo). */
const FAB_LABEL: Partial<Record<Tab, string>> = { hoy: 'Subir', preguntas: 'Preguntar' };

type AppShellProps = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  city: City;
  onCityChange: (city: City) => void;
  /** Signed-in only: unread notifications (bell) and confirmed balance (null while «★ …»). */
  account?: { unread: number; balance: number | null; onBell: () => void; onBalance: () => void };
  onFab?: () => void;
  /** Lupa in the top bar (wiki #140): shown while the screen's own search is out of view. */
  onSearch?: () => void;
  /** Desktop conversation panel of ¿Alguien sabe?. Hidden on phones, where details are full screen. */
  detail?: ReactNode;
  children: ReactNode;
};

export function AppShell({ tab, onTabChange, city, onCityChange, account, onFab, onSearch, detail, children }: AppShellProps) {
  const fabLabel = FAB_LABEL[tab];

  // Another tab: animated change, landing at the top. The current tab again: back to the top.
  const goTo = (next: Tab) => {
    if (next === tab) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    const order = TABS.findIndex((t) => t.id === next) - TABS.findIndex((t) => t.id === tab);
    navigateWithTransition(() => {
      onTabChange(next);
      window.scrollTo(0, 0);
    }, order > 0 ? 'forward' : 'back');
  };

  return (
    <div className="shell" data-layout={LAYOUT[tab]}>
      <aside className="shell__sidebar" aria-label="Menú">
        <div className="shell__brand">
          <img src="/logo.svg" alt="" width={40} height={40} />
          <span>BoliviaSabe</span>
        </div>
        <TabList tab={tab} onTabChange={goTo} />
        {fabLabel && onFab && (
          <button type="button" className="btn btn--full" onClick={onFab}>
            <PlusIcon size={18} /> {fabLabel}
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
            <select aria-label="Ciudad" value={city} onChange={(e) => onCityChange(e.target.value as City)}>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="shell__account">
            <button
              type="button"
              className="icon-btn shell__search"
              aria-label="Buscar"
              data-shown={onSearch ? 'true' : undefined}
              onClick={onSearch}
            >
              <SearchIcon />
            </button>
            {account && (
              <>
              <button type="button" className="icon-btn shell__bell" onClick={account.onBell} aria-label={`Avisos, ${account.unread} sin leer`}>
                <BellIcon />
                {account.unread > 0 && <span className="shell__badge">{account.unread > 9 ? '9+' : account.unread}</span>}
              </button>
              <button type="button" className="shell__balance" onClick={account.onBalance} aria-label="Tus yapitas, ver movimientos">
                <span className="yapita" aria-hidden="true">★</span>
                <span>{account.balance ?? '…'}</span>
              </button>
              </>
            )}
          </div>
          </div>
        </header>

        <main className="shell__main">{children}</main>

        {fabLabel && onFab && (
          <button type="button" className="btn shell__fab" onClick={onFab}>
            <PlusIcon size={18} /> {fabLabel}
          </button>
        )}

        <nav className="shell__nav" aria-label="Principal">
          <TabList tab={tab} onTabChange={goTo} />
        </nav>
      </div>

      {/* Desktop only, ¿Alguien sabe? only (hidden on phones, where details open full screen) */}
      {LAYOUT[tab] === 'split' && (
        <section className="shell__detail" aria-label="Conversación">
          {detail ?? <p className="shell__detail-empty">Toca una pregunta para ver la conversación.</p>}
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
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
