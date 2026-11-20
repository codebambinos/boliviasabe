// TEMPORARY smoke view for SPEC 01: checks the data layer in the browser.
// T12 replaces this file with the real routes and screens.
import {
  isDataError,
  useMovements,
  useSession,
  useSignInWithGoogle,
  useSignOut,
  useSigns,
  useWallet,
} from './data';

function errorText(error: unknown): string {
  return isDataError(error) ? `${error.code}: ${error.message}` : String(error);
}

export function App() {
  const session = useSession();
  const signedIn = session.data?.status === 'signed-in';
  const signIn = useSignInWithGoogle();
  const signOut = useSignOut();
  const signs = useSigns({ city: 'Cochabamba' });
  const wallet = useWallet({ enabled: signedIn });
  const movements = useMovements({ enabled: signedIn });

  const firstSigns = signs.data?.pages[0]?.items.slice(0, 3) ?? [];
  const lastMovements = movements.data?.pages[0]?.items.slice(0, 5) ?? [];
  const busy = signIn.isPending || signOut.isPending;

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1>BoliviaSabe · prueba de datos</h1>

      <section>
        <h2>Sesión</h2>
        {session.isPending && <p>Cargando…</p>}
        {session.isError && <p role="alert">{errorText(session.error)}</p>}
        {session.data?.status === 'guest' && (
          <>
            <p>Invitado</p>
            <button disabled={busy} onClick={() => signIn.mutate()}>
              {signIn.isPending ? 'Entrando…' : 'Continuar con Google'}
            </button>
          </>
        )}
        {session.data?.status === 'signed-in' && (
          <>
            <p>
              {session.data.profile?.displayName ?? 'Sin perfil'} · {session.data.profile?.zone}
            </p>
            <button disabled={busy} onClick={() => signOut.mutate()}>
              {signOut.isPending ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
          </>
        )}
      </section>

      {signedIn && (
        <section>
          <h2>Yapitas</h2>
          {wallet.isPending && <p>★ …</p>}
          {wallet.data && <p>★ {wallet.data.balance ?? '…'} ({wallet.data.status})</p>}
          <ul>
            {lastMovements.map((m) => (
              <li key={m.id}>
                {m.amount > 0 ? '+' : ''}
                {m.amount} {m.reason} · {m.status}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Letreros de Cochabamba</h2>
        {signs.isPending && <p>Cargando letreros…</p>}
        {signs.isError && (
          <p role="alert">
            {errorText(signs.error)} <button onClick={() => signs.refetch()}>Reintentar</button>
          </p>
        )}
        {firstSigns.map((sign) => (
          <article key={sign.id} style={{ marginBottom: 12 }}>
            <img src={sign.photoUrl} alt="" width={200} height={150} />
            <p>
              <strong>{sign.title}</strong> · {sign.price ?? 'sin precio'} · {sign.zone}
              <br />
              Subido por {sign.author.displayName} · A {sign.helpfulCount} les sirvió
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
