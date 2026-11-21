// /privacidad (SPEC 02, wiki › Cuenta y acceso): public, no account, outside the app shell.
// Google opens this URL before the login leaves «Testing» mode (wiki #56).
import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { EyeIcon, MailIcon, TrashIcon } from '../components/icons';
import { PageFrame } from '../components/PageFrame';
import { Yapita } from '../components/Yapita';
import { CONTACT_EMAIL, PRIVACY, type Highlight } from '../content/legal';
import './privacy-page.css';

const HIGHLIGHT_ICON: Record<Highlight['icon'], React.ReactNode> = {
  eye: <EyeIcon size={22} />,
  yapita: <Yapita size="lg" />,
  trash: <TrashIcon size={22} />,
};

const READING = PRIVACY.sections.filter((s) => s.id !== 'contacto');
const CONTACT = PRIVACY.sections.find((s) => s.id === 'contacto');

/** Staggered entrance order (privacy-page.css › legal-rise). */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

export function PrivacyPage() {
  const [active, setActive] = useState(READING[0]?.id);

  // «En esta página» marks the section being read
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    READING.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Scroll without touching the URL: a #hash entry would make Volver stop on this page
  const jump = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = document.getElementById(id);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    target?.querySelector('h2')?.focus({ preventScroll: true });
  };

  return (
    <PageFrame title="Privacidad">
      <main className="legal__main">
        <header className="legal__hero">
          <p className="legal__eyebrow legal__rise" style={order(0)}>{PRIVACY.eyebrow}</p>
          <h1 tabIndex={-1} className="legal__title legal__rise" style={order(1)}>
            {PRIVACY.title}
          </h1>
          <p className="legal__intro legal__rise" style={order(2)}>{PRIVACY.intro}</p>
          <p className="meta legal__rise" style={order(3)}>{PRIVACY.updated}</p>
        </header>

        <section className="legal__highlights" aria-labelledby="legal-highlights">
          <h2 id="legal-highlights" className="sr-only">{PRIVACY.highlightsTitle}</h2>
          <ul className="legal__cards">
            {PRIVACY.highlights.map((item, i) => (
              <li key={item.title} className="legal__card legal__rise" style={order(4 + i)}>
                <span className={`legal__glyph legal__glyph--${item.icon}`}>{HIGHLIGHT_ICON[item.icon]}</span>
                <h3 className="legal__card-title">{item.title}</h3>
                <p className="legal__card-text">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="legal__layout">
          <nav className="legal__toc" aria-labelledby="legal-toc">
            <p id="legal-toc" className="legal__toc-title">{PRIVACY.tocTitle}</p>
            <ol>
              {READING.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined} onClick={jump(s.id)}>
                    <span className="num">{String(i + 1).padStart(2, '0')}</span> {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal__sections">
            {READING.map((s, i) => (
              <section key={s.id} id={s.id} className="legal__section" aria-labelledby={`${s.id}-title`}>
                <span className="legal__num num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="legal__section-body">
                  <h2 id={`${s.id}-title`} tabIndex={-1}>{s.title}</h2>
                  {s.paragraphs.map((text) => (
                    <p key={text}>{text}</p>
                  ))}
                  {s.id === 'tus-yapitas' && <p className="notice">Red de pruebas, sin dinero real</p>}
                </div>
              </section>
            ))}

            {CONTACT && (
              <section id={CONTACT.id} className="legal__contact" aria-labelledby="contacto-title">
                <h2 id="contacto-title" tabIndex={-1}>{CONTACT.title}</h2>
                {CONTACT.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
                <a className="btn" href={`mailto:${CONTACT_EMAIL}`}>
                  <MailIcon size={20} /> Escríbenos
                </a>
                <p className="meta legal__mail">{CONTACT_EMAIL}</p>
              </section>
            )}
          </div>
        </div>
      </main>
    </PageFrame>
  );
}
