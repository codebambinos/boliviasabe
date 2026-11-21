// /privacidad (SPEC 02, wiki › Cuenta y acceso): public, no account, outside the app shell.
// Google opens this URL before the login leaves «Testing» mode (wiki #56).
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeftIcon } from '../components/icons';
import { CONTACT_EMAIL, PRIVACY } from '../content/legal';
import './privacy-page.css';

export function PrivacyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Privacidad · BoliviaSabe';
    window.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      document.title = previous;
    };
  }, []);

  // Back to where the person was; from a direct link (no in-app entry) to Hoy
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/', { replace: true });
  };

  return (
    <div className="legal">
      <div className="aguayo" />
      <header className="legal__bar">
        <button type="button" className="legal__back" onClick={goBack}>
          <ArrowLeftIcon size={20} /> Volver
        </button>
        <img className="legal__logo" src="/logo.svg" alt="BoliviaSabe" width={32} height={32} />
      </header>

      <main className="legal__body">
        <h1 ref={titleRef} tabIndex={-1} className="legal__title">{PRIVACY.title}</h1>
        <p className="meta legal__updated">{PRIVACY.updated}</p>
        <p className="legal__intro">{PRIVACY.intro}</p>
        <p className="notice">Red de pruebas, sin dinero real</p>

        {PRIVACY.sections.map((section) => (
          <section key={section.title} className="legal__section">
            <h2>{section.title}</h2>
            {section.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </section>
        ))}
        <p>
          <a className="legal__mail" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}
