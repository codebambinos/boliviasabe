import { useEffect, useRef, useState } from 'react';
import { AppShell, type Tab } from './components/AppShell';
import { ChipRow } from './components/ChipRow';
import { SignSheet } from './components/SignSheet';
import { SignTile, SignTileSkeleton } from './components/SignTile';
import { feedSection, timeAgo, type FeedSection } from './components/time';
import {
  DEFAULT_CITY,
  TAGS,
  isDataError,
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

function errorText(error: unknown): string {
  return isDataError(error) ? `${error.code}: ${error.message}` : String(error);
}

const ago = timeAgo;

export function App() {
  const [tab, setTab] = useState<Tab>('hoy');
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  const [selected, setSelected] = useState<Sign | null>(null);
  const [searchHidden, setSearchHidden] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const toggleSaved = useToggleSaved();
  const onToggleSave = (sign: Sign) => toggleSaved.mutate({ kind: 'sign', id: sign.id });

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
            ? { unread: 2, balance: wallet.data?.balance ?? null, onBell: () => setTab('yo'), onBalance: () => setTab('yo') }
            : undefined
        }
        onFab={() => setTab(tab)}
        onSearch={searchHidden ? goToSearch : undefined}
      >
        {tab === 'hoy' && <HoySample city={city} searchRef={searchRef} onOpen={setSelected} onToggleSave={onToggleSave} />}
        {tab === 'preguntas' && (
          <>
            <h1 className="screen-title">¿Alguien sabe?</h1>
            <div className="card">
              <p className="muted">Esta pantalla llega en T20.</p>
            </div>
          </>
        )}
        {tab === 'yo' && <YoSample />}
      </AppShell>
      {selected && <SignSheet key={selected.id} sign={selected} onClose={() => setSelected(null)} onToggleSave={onToggleSave} />}
    </>
  );
}

const SECTION_TITLE: Record<FeedSection, string> = { hoy: 'Hoy', semana: 'Esta semana', antes: 'Antes' };

function HoySample({
  city,
  searchRef,
  onOpen,
  onToggleSave,
}: {
  city: City;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onOpen: (sign: Sign) => void;
  onToggleSave: (sign: Sign) => void;
}) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const signs = useSigns({ city, search, tags });
  const items = signs.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));

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
      {/* No big title: the city is in the top bar and the first section says «Hoy» (DESIGN.md) */}
      <h1 className="sr-only">Hoy en {city}</h1>
      <label className="sr-only" htmlFor="search">Buscar letreros</label>
      <input ref={searchRef} id="search" className="input" style={{ marginTop: 'var(--s-4)' }} type="search" placeholder="Buscar: almuerzo, trufi, feria…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ChipRow label="Filtrar por etiqueta">
        {TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
            {tag}
          </button>
        ))}
      </ChipRow>

      {signs.isPending && (
        <div className="tile-grid">
          {[0, 1, 2, 3].map((i) => <SignTileSkeleton key={i} />)}
        </div>
      )}
      {signs.isError && (
        <div className="card" role="alert">
          <p>{errorText(signs.error)}</p>
          <button type="button" className="btn" onClick={() => signs.refetch()}>Reintentar</button>
        </div>
      )}
      {signs.isSuccess && items.length === 0 && (
        <div className="card">
          <p>Tu ciudad recién empieza: sube el primer letrero.</p>
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
          {signs.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </>
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

function YoSample() {
  const session = useSession();
  const signIn = useSignInWithGoogle();
  const signOut = useSignOut();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });
  const movements = useMovements({ enabled: signedIn });
  const last = movements.data?.pages[0]?.items.slice(0, 5) ?? [];

  if (session.isPending) return <div className="card"><div className="skeleton" style={{ height: '4rem' }} /></div>;
  if (session.data?.status !== 'signed-in') {
    return (
      <>
        <h1 className="screen-title">Yo</h1>
        <div className="card">
          <p>Entra para guardar tus yapitas y tu actividad.</p>
          <button type="button" className="btn btn--full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
            {signIn.isPending ? 'Entrando…' : 'Continuar con Google'}
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="screen-title">Yo</h1>
      <div className="yo-grid">
      <div className="card" style={{ overflow: 'hidden', paddingTop: 0 }}>
        <div className="aguayo" style={{ margin: '0 calc(var(--s-4) * -1) var(--s-4)' }} />
        <h2>{session.data.profile?.displayName ?? 'Sin perfil'}</h2>
        <p className="meta">{session.data.profile?.city} · {session.data.profile?.zone}</p>
        <p>
          <span className="tag">{session.data.profile?.badge}</span>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', margin: 'var(--s-4) 0' }}>
          <span className="yapita" style={{ width: '2.5rem', height: '2.5rem', fontSize: '1.25rem' }} aria-hidden="true">★</span>
          <div>
            <div className="num" style={{ font: 'var(--w-title) 2rem/1 var(--font-title)', letterSpacing: '-0.02em' }}>{wallet.data?.balance ?? '…'}</div>
            <div className="meta">yapitas</div>
          </div>
        </div>
        <button type="button" className="btn btn--secondary" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Cerrar sesión
        </button>
      </div>
      <div className="card">
        <h2>Movimientos</h2>
        <ul className="rows">
          {last.map((m) => (
            <li key={m.id}>
              <span className="yapita" aria-hidden="true">★</span>
              <span className="row__main">
                {REASON_LABEL[m.reason]}
                <span className="meta" style={{ display: 'block' }}>{ago(m.createdAt)}</span>
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
        <p className="notice" style={{ marginTop: 'var(--s-3)', marginBottom: 0 }}>Red de pruebas, sin dinero real</p>
      </div>
      </div>
    </>
  );
}
