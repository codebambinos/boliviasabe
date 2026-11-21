// «Esto ya no está disponible» + Ir a Hoy for a /l/:id or /p/:id that is gone (wiki › Transversal: «Esto ya no
// está disponible» + Ir a Hoy). A static placeholder: it never fetches anything.
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
