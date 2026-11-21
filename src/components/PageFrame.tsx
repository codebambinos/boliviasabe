// Frame of the pages outside the app shell (/privacidad, /l/:id, /p/:id, /nueva-contrasena):
// aguayo stripe, a bar with «← Volver» and the logo. The page brings its own <main> and one <h1>,
// which gets the focus on arrival; `title` is the browser tab title.
import { useEffect, type ReactNode } from 'react';
import { ArrowLeftIcon } from './icons';
import { useGoBack } from './useGoBack';
import './page-frame.css';

export function PageFrame({ title, children }: { title: string; children: ReactNode }) {
  const goBack = useGoBack();

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · BoliviaSabe`;
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <div className="page">
      <div className="aguayo page__stripe" />
      <header className="page__bar">
        <div className="page__bar-in">
          <button type="button" className="page__back" onClick={goBack}>
            <ArrowLeftIcon size={20} /> Volver
          </button>
          <img className="page__logo" src="/logo.svg" alt="BoliviaSabe" width={32} height={32} />
        </div>
      </header>
      {children}
    </div>
  );
}
