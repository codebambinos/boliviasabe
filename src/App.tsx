// TEMPORARY smoke view (SPEC 01 + T11): checks the data layer and the base styles in the browser.
// T12 replaces it with real routes; T18–T21 build the real screens. Use it as a style sample.
import { useState } from 'react';
import { AppShell, type Tab } from './components/AppShell';
import {
  DEFAULT_CITY,
  TAGS,
  isDataError,
  useMovements,
  useSession,
  useSignInWithGoogle,
  useSignOut,
  useSigns,
  useWallet,
  type City,
  type Sign,
  type Tag,
} from './data';

function errorText(error: unknown): string {
  return isDataError(error) ? `${error.code}: ${error.message}` : String(error);
}

export function App() {
  const [tab, setTab] = useState<Tab>('hoy');
  const [city, setCity] = useState<City>(DEFAULT_CITY);
  const [selected, setSelected] = useState<Sign | null>(null);
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const wallet = useWallet({ enabled: signedIn });

  return (
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
      detail={selected ? <SignDetail sign={selected} /> : undefined}
    >
      {tab === 'hoy' && <HoySample city={city} onSelect={setSelected} />}
      {tab === 'preguntas' && (
        <div className="card">
          <h2>¿Alguien sabe?</h2>
          <p className="muted">Esta pantalla llega en T20.</p>
        </div>
      )}
      {tab === 'yo' && <YoSample />}
    </AppShell>
  );
}

function HoySample({ city, onSelect }: { city: City; onSelect: (sign: Sign) => void }) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const signs = useSigns({ city, search, tags });
  const items = signs.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));

  return (
    <>
      <label className="sr-only" htmlFor="search">Buscar letreros</label>
      <input id="search" className="input" type="search" placeholder="Buscar: almuerzo, trufi, feria…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="chip-row" style={{ margin: '0.75rem 0' }}>
        {TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
            {tag}
          </button>
        ))}
      </div>

      {signs.isPending && [0, 1].map((i) => <div key={i} className="card"><div className="skeleton" style={{ height: '10rem' }} /></div>)}
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
      {items.map((sign) => (
        <article key={sign.id} className="card" onClick={() => onSelect(sign)}>
          <img src={sign.photoUrl} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '0.75rem' }} />
          <h3 style={{ marginTop: '0.625rem' }}>{sign.title}</h3>
          <p>
            <strong>{sign.price ?? 'Sin precio'}</strong> · {sign.zone}
          </p>
          <p style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {sign.tags.map((t) => <span key={t} className="tag">{t}</span>)}
          </p>
          <p className="muted">Subido por {sign.author.displayName} · A {sign.helpfulCount} les sirvió</p>
          <button type="button" className="btn btn--secondary">Me sirvió</button>
        </article>
      ))}
      {signs.hasNextPage && (
        <button type="button" className="btn btn--ghost btn--full" disabled={signs.isFetchingNextPage} onClick={() => signs.fetchNextPage()}>
          {signs.isFetchingNextPage ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </>
  );
}

function SignDetail({ sign }: { sign: Sign }) {
  return (
    <div className="card">
      <img src={sign.photoUrl} alt="" style={{ borderRadius: '0.75rem' }} />
      <h2 style={{ marginTop: '0.75rem' }}>{sign.title}</h2>
      <p>{sign.price ?? 'Sin precio'} · {sign.zone}</p>
      <p className="muted">Subido por {sign.author.displayName}</p>
    </div>
  );
}

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
      <div className="card">
        <p>Entra para guardar tus yapitas y tu actividad.</p>
        <button type="button" className="btn btn--full" disabled={signIn.isPending} onClick={() => signIn.mutate()}>
          {signIn.isPending ? 'Entrando…' : 'Continuar con Google'}
        </button>
      </div>
    );
  }
  return (
    <>
      <div className="card">
        <h2>{session.data.profile?.displayName ?? 'Sin perfil'}</h2>
        <p className="muted">{session.data.profile?.city} · {session.data.profile?.zone}</p>
        <p>
          <span className="tag">{session.data.profile?.badge}</span>
        </p>
        <button type="button" className="btn btn--ghost" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
          Cerrar sesión
        </button>
      </div>
      <div className="card">
        <h2>Movimientos</h2>
        <p>Saldo: ★ {wallet.data?.balance ?? '…'}</p>
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {last.map((m) => (
            <li key={m.id}>
              {m.amount > 0 ? '+' : ''}{m.amount} · {m.reason} ·{' '}
              <span className={m.status === 'confirmed' ? 'tag tag--ok' : 'tag tag--muted'}>
                {m.status === 'confirmed' ? 'Confirmado' : m.status === 'pending' ? 'Pendiente' : 'Error'}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ marginTop: '0.5rem' }}>Red de pruebas, sin dinero real</p>
      </div>
    </>
  );
}
