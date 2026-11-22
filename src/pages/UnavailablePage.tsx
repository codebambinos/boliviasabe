// «Esto ya no está disponible» + Ir a Hoy for a /l/:id or /p/:id that is gone, and the error + Reintentar for one
// that could not load (wiki › Transversal). Static: they never fetch anything themselves.
import { Link } from 'react-router';
import { PageFrame } from '../components/PageFrame';

export function UnavailablePage({ title }: { title: string }) {
  return (
    <PageFrame title={title}>
      <main className="page__main">
        <div className="empty">
          <h1 tabIndex={-1} className="empty__title">Esto ya no está disponible</h1>
          <Link className="btn" to="/" replace>Ir a Hoy</Link>
        </div>
      </main>
    </PageFrame>
  );
}

/** A /l/:id that could not load (no signal, server error): its message + Reintentar, never a silent Hoy (wiki › Transversal). */
export function LoadFailedPage({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <PageFrame title={title}>
      <main className="page__main">
        <div className="empty" role="alert">
          <h1 tabIndex={-1} className="empty__title">{message}</h1>
          <div className="empty__actions">
            <button type="button" className="btn" onClick={onRetry}>Reintentar</button>
            <Link className="btn btn--secondary" to="/" replace>Ir a Hoy</Link>
          </div>
        </div>
      </main>
    </PageFrame>
  );
}
