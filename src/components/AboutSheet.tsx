// «Acerca de» (SPEC 02, wiki › Yo): what BoliviaSabe is, who made it and how to reach us.
// A full page on a phone, a window on desktop. No social links yet (wiki #132).
import { useId, type MouseEvent } from 'react';
import { ABOUT, CONTACT_EMAIL } from '../content/legal';
import { CloseIcon } from './icons';
import { Sheet } from './Sheet';
import './about-sheet.css';

type AboutSheetProps = { onClose: () => void; onOpenPrivacy: () => void };

export function AboutSheet({ onClose, onOpenPrivacy }: AboutSheetProps) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} variant="page" onClose={onClose}>
      {(close) => {
        // Close the sheet first (it pops its own history entry), then open the page,
        // so Back from /privacidad lands on Yo and not on a stale sheet entry.
        const toPrivacy = (event: MouseEvent<HTMLAnchorElement>) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          window.addEventListener('popstate', onOpenPrivacy, { once: true });
          close();
        };
        return (
          <>
            <header className="sheet__bar">
              <h2 id={titleId} className="sheet__bar-title">{ABOUT.title}</h2>
              <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">
              <div className="sheet__content about">
                <p className="about__what">{ABOUT.what}</p>

                <section className="about__block" aria-labelledby={`${titleId}-team`}>
                  <h3 id={`${titleId}-team`} className="card__title">Hecho por {ABOUT.team.org}</h3>
                  <p>{ABOUT.team.people.join(', ').replace(/, ([^,]*)$/, ' y $1')}</p>
                </section>

                <section className="about__block" aria-labelledby={`${titleId}-contact`}>
                  <h3 id={`${titleId}-contact`} className="card__title">{ABOUT.contactLabel}</h3>
                  <p>
                    <a className="about__link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                  </p>
                  <p>
                    <a className="about__link" href="/privacidad" onClick={toPrivacy}>Privacidad</a>
                  </p>
                </section>
              </div>
            </div>
          </>
        );
      }}
    </Sheet>
  );
}
