// App frame: top bar, aguayo stripe, main column, bottom nav (phone) or sidebar (desktop),
// floating action button and an optional detail panel (desktop only).
// It holds no data of its own: screens and routes (T12) pass everything in.
import type { ReactNode } from 'react';
import { CITIES, type City } from '../data';
import { BellIcon, ChevronDownIcon, HomeIcon, PlusIcon, QuestionIcon, UserIcon } from './icons';
import './app-shell.css';

export type Tab = 'hoy' | 'preguntas' | 'yo';

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
  /** Desktop detail panel (letrero or pregunta). Hidden on phones, where details are full screen. */
  detail?: ReactNode;
  children: ReactNode;
};

export function AppShell({ tab, onTabChange, city, onCityChange, account, onFab, detail, children }: AppShellProps) {
  const fabLabel = FAB_LABEL[tab];

  return (
    <div className="shell" data-has-detail={detail ? 'true' : undefined}>
      <aside className="shell__sidebar" aria-label="Menú">
        <div className="shell__brand">
          <img src="/logo.svg" alt="" width={36} height={36} />
          <span>BoliviaSabe</span>
        </div>
        <TabList tab={tab} onTabChange={onTabChange} />
        {fabLabel && onFab && (
          <button type="button" className="btn btn--full" onClick={onFab}>
            <PlusIcon size={18} /> {fabLabel}
          </button>
        )}
      </aside>

      <div className="shell__column">
        <header className="shell__top">
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
          {account && (
            <div className="shell__account">
              <button type="button" className="icon-btn shell__bell" onClick={account.onBell} aria-label={`Avisos, ${account.unread} sin leer`}>
                <BellIcon />
                {account.unread > 0 && <span className="shell__badge">{account.unread > 9 ? '9+' : account.unread}</span>}
              </button>
              <button type="button" className="shell__balance" onClick={account.onBalance} aria-label="Tus yapitas, ver movimientos">
                <span aria-hidden="true">★</span> {account.balance ?? '…'}
              </button>
            </div>
          )}
          </div>
        </header>
        <div className="aguayo shell__aguayo" />

        <main className="shell__main">{children}</main>

        {fabLabel && onFab && (
          <button type="button" className="btn shell__fab" onClick={onFab}>
            <PlusIcon size={18} /> {fabLabel}
          </button>
        )}

        <nav className="shell__nav" aria-label="Principal">
          <TabList tab={tab} onTabChange={onTabChange} />
        </nav>
      </div>

      {detail && <section className="shell__detail" aria-label="Detalle">{detail}</section>}
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
            <Icon />
            <span>{label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
