// TEMPORARY smoke view (SPEC 01 + T11): the real shell and components on mock data.
// T12 replaces it with real routes; T18–T21 build the real screens from these parts.
import { useEffect, useId, useRef, useState } from 'react';
import { AppShell, type Tab } from './components/AppShell';
import { AuthGate, useRequireAccount } from './components/AuthGate';
import { ChipRow } from './components/ChipRow';
import { CloseIcon, ExternalIcon, GoogleIcon, MailIcon, SearchIcon } from './components/icons';
import { Hint } from './components/Hint';
import { errorMessage } from './components/messages';
import { Sheet } from './components/Sheet';
import { SignSheet } from './components/SignSheet';
import { SignTile, SignTileSkeleton } from './components/SignTile';
import { feedSection, timeAgo, type FeedSection } from './components/time';
import { navigateWithTransition } from './components/transition';
import { Yapita } from './components/Yapita';
import {
  DEFAULT_CITY,
  TAGS,
  useMovements,
  useSession,
  useSignInWithGoogle,
  useSignOut,
  useSigns,
  useToggleSaved,
  useWallet,
  type City,
  type Movement,
  type Sign,
  type Tag,
} from './data';

export function App() {
  return (
    <AuthGate>
      <Screens />
    </AuthGate>
  );
}

function Screens() {
  const [tab, setTab] = useState<Tab>('hoy');
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  const [selected, setSelected] = useState<Sign | null>(null);
  const [avisos, setAvisos] = useState(false);
  const [searchHidden, setSearchHidden] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const toggleSaved = useToggleSaved();
  const requireAccount = useRequireAccount();
  const signIn = useSignInWithGoogle();

  const onToggleSave = (sign: Sign) =>
    requireAccount('Así guardas este letrero para verlo después.', () => toggleSaved.mutate({ kind: 'sign', id: sign.id }));

  // Lupa (wiki #140): only while Hoy's own search is off screen
  useEffect(() => {
    const input = searchRef.current;
    if (tab !== 'hoy' || !input) {
      setSearchHidden(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setSearchHidden(!entry.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [tab]);

  const goToSearch = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), smooth ? 350 : 0);
  };

  return (
    <>
      <AppShell
        tab={tab}
        onTabChange={setTab}
        city={city}
        onCityChange={setCity}
        account={
          signedIn
            ? {
                unread: 0,
                balance: wallet.data?.balance ?? null,
                onBell: () => setAvisos(true),
                // The balance opens Movimientos (wiki), not just the top of Yo
                onBalance: () => {
                  navigateWithTransition(() => setTab('yo'), 'forward');
                  window.setTimeout(() => {
                    const heading = document.getElementById('movimientos-title');
                    heading?.scrollIntoView({ block: 'start' });
                    heading?.focus({ preventScroll: true });
                  }, 60);
                },
              }
            : undefined
        }
        onSignIn={() => requireAccount('Entra para dar «Me sirvió», guardar y ganar yapitas.', () => undefined, 'Entra a BoliviaSabe')}
        onFab={() =>
          requireAccount(
            tab === 'hoy' ? 'Así tu letrero aparece en Hoy y ganas una yapita.' : 'Así tus vecinos pueden responderte.',
            () => undefined,
          )
        }
        onSearch={searchHidden ? goToSearch : undefined}
        detailEmpty="Cuando haya preguntas, su conversación se abre aquí."
      >
        {tab === 'hoy' && <HoySample city={city} searchRef={searchRef} onCity={setCity} onOpen={setSelected} onToggleSave={onToggleSave} />}
        {tab === 'preguntas' && <PreguntasSample city={city} />}
        {tab === 'yo' && <YoSample onSignIn={() => signIn.mutate()} signingIn={signIn.isPending} />}
      </AppShell>
      {selected && <SignSheet key={selected.id} sign={selected} onClose={() => setSelected(null)} onToggleSave={onToggleSave} />}
      {avisos && <AvisosSheet onClose={() => setAvisos(false)} />}
    </>
  );
}

const SECTION_TITLE: Record<FeedSection, string> = { hoy: 'Hoy', semana: 'Esta semana', antes: 'Antes' };

function HoySample({
  city,
  searchRef,
  onCity,
  onOpen,
  onToggleSave,
}: {
  city: City;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onCity: (city: City) => void;
  onOpen: (sign: Sign) => void;
  onToggleSave: (sign: Sign) => void;
}) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const signs = useSigns({ city, search, tags });
  const items = signs.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  const filtering = search.trim() !== '' || tags.length > 0;
  const clear = () => {
    setSearch('');
    setTags([]);
  };

  // Hoy · Esta semana · Antes (wiki #140); the list is newest first, so sections come in order
  const now = new Date();
  const sections: { id: FeedSection; items: Sign[] }[] = [];
  for (const sign of items) {
    const id = feedSection(sign.createdAt, now);
    const last = sections[sections.length - 1];
    if (last?.id === id) last.items.push(sign);
    else sections.push({ id, items: [sign] });
  }

  return (
    <>
      {/* The city is in the top bar and the first section says «Hoy» (DESIGN.md) */}
      <h1 className="sr-only">Hoy en {city}</h1>
      <Hint id="hoy">Abre un letrero y dale «Me sirvió»: quien lo subió gana una yapita.</Hint>
      <div className="search">
        <label className="sr-only" htmlFor="search">Buscar letreros</label>
        <SearchIcon className="search__icon" size={20} />
        <input
          ref={searchRef}
          id="search"
          className="input search__input"
          type="search"
          enterKeyHint="search"
          placeholder="Buscar: almuerzo, trufi, feria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <a className="skip-link skip-link--inline" href="#letreros">Saltar a los letreros</a>
      <ChipRow label="Filtrar por etiqueta">
        {TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
            {tag}
          </button>
        ))}
      </ChipRow>

      <div id="letreros" tabIndex={-1} aria-busy={signs.isPending || undefined}>
        {filtering && signs.isSuccess && items.length > 0 && (
          <p className="filter-summary" role="status">
            <span>
              {items.length === 1 ? '1 letrero' : `${items.length}${signs.hasNextPage ? '+' : ''} letreros`}
              {tags.length > 0 && ` · ${tags.join(', ')}`}
            </span>
            <button type="button" className="link-btn" onClick={clear}>Quitar filtros</button>
          </p>
        )}

        {signs.isPending && (
          <>
            <p className="sr-only" role="status">Cargando letreros…</p>
            <div className="tile-grid">
              {[0, 1, 2, 3].map((i) => <SignTileSkeleton key={i} />)}
            </div>
          </>
        )}
        {signs.isError && (
          <div className="empty" role="alert">
            <h2 className="empty__title">{errorMessage(signs.error)}</h2>
            <p className="empty__text">Tus filtros y lo que escribiste siguen aquí.</p>
            <button type="button" className="btn btn--secondary" onClick={() => signs.refetch()}>Reintentar</button>
          </div>
        )}
        {signs.isSuccess && items.length === 0 && filtering && (
          <div className="empty" role="status">
            <h2 className="empty__title">No encontramos letreros con eso</h2>
            <p className="empty__text">Prueba con otra palabra o quita las etiquetas.</p>
            <button type="button" className="btn btn--secondary" onClick={clear}>Quitar filtros</button>
          </div>
        )}
        {signs.isSuccess && items.length === 0 && !filtering && (
          <div className="empty">
            <h2 className="empty__title">Tu ciudad recién empieza</h2>
            <p className="empty__text">Sube el primer letrero de {city} con el botón «Subir letrero».</p>
            {city !== DEFAULT_CITY && (
              <button type="button" className="btn btn--secondary" onClick={() => onCity(DEFAULT_CITY)}>Ver {DEFAULT_CITY}</button>
            )}
          </div>
        )}
        {sections.map((section) => (
          <section key={section.id} className="feed-section" aria-labelledby={`sec-${section.id}`}>
            <div className="feed-section__head">
              <h2 id={`sec-${section.id}`} className="feed-section__title">{SECTION_TITLE[section.id]}</h2>
              {section.id === 'antes' && <span className="meta">Puede estar desactualizado</span>}
            </div>
            <ul className="tile-grid">
              {section.items.map((sign) => (
                <li key={sign.id}>
                  <SignTile sign={sign} onOpen={onOpen} onToggleSave={onToggleSave} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {signs.hasNextPage && (
          <button type="button" className="btn btn--secondary btn--full" style={{ marginTop: 'var(--s-6)' }} disabled={signs.isFetchingNextPage} onClick={() => signs.fetchNextPage()}>
            {signs.isFetchingNextPage ? 'Cargando…' : 'Ver más letreros'}
          </button>
        )}
      </div>
    </>
  );
}

function PreguntasSample({ city }: { city: City }) {
  return (
    <>
      <h1 className="screen-title">¿Alguien sabe?</h1>
      <Hint id="preguntas">Pregunta lo que necesites saber: quien te ayude gana yapitas.</Hint>
      <div className="empty">
        <h2 className="empty__title">Nadie preguntó todavía en {city}</h2>
        <p className="empty__text">¿Buscas un plomero, una farmacia de turno o si hay agua en tu zona? Pregunta con el botón «Preguntar».</p>
      </div>
    </>
  );
}

function AvisosSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <h2 id={titleId} className="sheet__bar-title">Avisos</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
              <CloseIcon />
            </button>
          </header>
          <div className="sheet__body">
            <div className="sheet__content empty">
              <h3 className="empty__title">Sin avisos por ahora</h3>
              <p className="empty__text">Aquí verás cuando alguien te responda o le sirva tu letrero.</p>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}

// Sample labels for the style sample; T21 takes the final wording from the wiki.
const REASON_LABEL: Record<Movement['reason'], string> = {
  bienvenida: 'Bienvenida',
  letrero: 'Subiste un letrero',
  'sirvio-l': 'Tu letrero sirvió',
  ayuda: 'Tu respuesta sirvió',
  cierre: 'Cerraste tu pregunta',
  urgente: 'Pregunta urgente',
  canje: 'Canje',
};

const CANJE_GOAL = 100;

type Theme = 'dark' | 'light' | 'system';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('bs-theme');
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme) {
  try {
    localStorage.setItem('bs-theme', theme);
  } catch {
    /* private mode: applies for this visit only */
  }
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // The phone's status bar follows the ground
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#151110' : '#f5f2ef');
}

function YoSample({ onSignIn, signingIn }: { onSignIn: () => void; signingIn: boolean }) {
  const session = useSession();
  const signOut = useSignOut();
  const requireAccount = useRequireAccount();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const movements = useMovements({ enabled: signedIn });
  const last = movements.data?.pages[0]?.items.slice(0, 5) ?? [];
  const [theme, setTheme] = useState<Theme>(readTheme);

  if (session.isPending) {
    return (
      <div className="card" aria-busy="true">
        <p className="sr-only" role="status">Cargando…</p>
        <div className="skeleton" style={{ height: '4rem' }} />
      </div>
    );
  }

  if (session.data?.status !== 'signed-in') {
    return (
      <>
        <h1 className="screen-title">Yo</h1>
        <div className="card profile">
          <img className="profile__tilcho" src="/tilcho/tilcho-saludo.svg" alt="" width={96} height={111} />
          <h2 className="profile__name">¡Hola, vecino!</h2>
          <p className="empty__text">
            Cuando un letrero o una respuesta tuya le sirve a alguien, ganas <strong>yapitas</strong>. Entra para guardarlas junto
            con tu actividad.
          </p>
          <div className="profile__actions">
            <button type="button" className="btn btn--secondary btn--full auth__google" disabled={signingIn} onClick={onSignIn}>
              <GoogleIcon /> {signingIn ? 'Entrando…' : 'Continuar con Google'}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--full"
              onClick={() => requireAccount('Entra con tu correo y contraseña.', () => undefined, 'Entra a BoliviaSabe')}
            >
              <MailIcon size={20} /> Usar mi correo
            </button>
          </div>
        </div>
      </>
    );
  }

  const profile = session.data.profile;
  const balance = wallet.data?.balance ?? null;
  const progress = Math.min(100, Math.round(((balance ?? 0) / CANJE_GOAL) * 100));

  return (
    <>
      <h1 className="screen-title">Yo</h1>
      <div className="yo-grid">
        <div className="card profile yo-grid__profile">
          <div className="aguayo profile__stripe" />
          <img className="profile__tilcho" src="/tilcho/tilcho-saludo.svg" alt="" width={84} height={97} />
          <h2 className="profile__name">{profile?.displayName ?? 'Sin perfil'}</h2>
          <p className="meta">{profile?.city} · {profile?.zone}</p>
          <p className="profile__badge">
            <span className="tag">{profile?.badge}</span>
          </p>
          <div className="profile__balance">
            <Yapita size="lg" />
            <div>
              <p className="profile__amount num">{balance ?? '…'}</p>
              <p className="meta">yapitas</p>
            </div>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={CANJE_GOAL}
            aria-valuenow={balance ?? 0}
            aria-label="Yapitas hacia el canje"
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="meta profile__goal">
            {balance ?? 0} de {CANJE_GOAL} · Canje con negocios, próximamente
          </p>
          <p className="profile__why">Ganas yapitas cuando un letrero o una respuesta tuya le sirve a alguien.</p>
        </div>

        <div id="movimientos" className="card yo-grid__moves">
          <h2 id="movimientos-title" tabIndex={-1} className="card__title card__title--target">Movimientos</h2>
          {movements.isSuccess && last.length === 0 ? (
            <p className="empty__text">Gana yapitas subiendo letreros y ayudando.</p>
          ) : (
            <ul className="rows">
              {last.map((m) => (
                <li key={m.id}>
                  <Yapita />
                  <span className="row__main">
                    {REASON_LABEL[m.reason]}
                    <span className="meta row__sub">
                      {timeAgo(m.createdAt)}
                      {m.explorerUrl && m.txHash && (
                        <a className="row__record" href={m.explorerUrl} target="_blank" rel="noreferrer" aria-label={`Ver el registro público ${shortHash(m.txHash)}`}>
                          Ver registro
                          <ExternalIcon size={12} />
                        </a>
                      )}
                    </span>
                  </span>
                  <span className="row__end">
                    <span className="amount">{m.amount > 0 ? `+${m.amount}` : `−${Math.abs(m.amount)}`}</span>
                    <span className={m.status === 'confirmed' ? 'state' : m.status === 'pending' ? 'state state--pending' : 'state state--error'}>
                      {m.status === 'confirmed' ? 'Confirmado' : m.status === 'pending' ? 'Pendiente' : 'Error'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="notice" style={{ marginTop: 'var(--s-3)', marginBottom: 0 }}>Red de pruebas, sin dinero real</p>
        </div>

        <div className="card yo-grid__account">
          <h2 className="card__title">Mi cuenta de prueba</h2>
          <p className="account__why">Cada yapita queda anotada en un registro público que nadie puede cambiar.</p>
          {wallet.data?.status === 'ready' && wallet.data.address ? (
            <>
              <p className="account__address num">{shortHash(wallet.data.address)}</p>
              <div className="account__actions">
                <CopyButton text={wallet.data.address} />
                <a className="btn btn--secondary btn--small" href={`${EXPLORER_ACCOUNT}${wallet.data.address}`} target="_blank" rel="noreferrer">
                  Ver mi registro público <ExternalIcon size={14} />
                </a>
              </div>
            </>
          ) : wallet.data?.status === 'error' ? (
            <>
              <p className="empty__text">Algo falló, intenta de nuevo</p>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => wallet.refetch()}>Reintentar</button>
            </>
          ) : (
            <p className="empty__text" role="status">Preparando tu cuenta…</p>
          )}
        </div>

        <div className="card yo-grid__settings">
          <h2 className="card__title">Ajustes</h2>
          <fieldset className="setting">
            <legend className="setting__label">Tema</legend>
            <div className="segmented">
              {(
                [
                  ['dark', 'Oscuro'],
                  ['light', 'Claro'],
                  ['system', 'Sistema'],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={theme === value}
                    onChange={() => {
                      setTheme(value);
                      applyTheme(value);
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="link-btn link-btn--ink setting__signout" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            {signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </>
  );
}

/** «GABC…XYZ9»: the start and end of a Stellar address or transaction hash. */
function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

const EXPLORER_ACCOUNT = 'https://stellar.expert/explorer/testnet/account/';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--secondary btn--small"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        })
      }
    >
      <span aria-live="polite">{copied ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}
