// «Acerca de» (SPEC 02, wiki › Yo): what BoliviaSabe is, how it works, who made it and how to
// reach us. A full page on a phone, a window on desktop. No social links yet (wiki #132).
import { useId, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ABOUT, CONTACT_EMAIL } from '../content/legal';
import { ChevronRightIcon, CloseIcon, EyeIcon, MailIcon, PlusIcon, QuestionIcon } from './icons';
import { afterSheetPop, Sheet } from './Sheet';
import { Yapita } from './Yapita';
import './about-sheet.css';

type AboutSheetProps = { onClose: () => void; onOpenPrivacy: () => void };

const STEP_ICON: Record<(typeof ABOUT.steps)[number]['icon'], ReactNode> = {
  plus: <PlusIcon size={20} />,
  question: <QuestionIcon size={20} />,
  yapita: <Yapita size="lg" />,
};

/** When this build was made, in Bolivia: tells which version an installed app is running (SPEC 16). */
const BUILT = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(Number(__APP_VERSION__.split('-').pop())));

/** Staggered entrance order (about-sheet.css › about-rise). */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

export function AboutSheet({ onClose, onOpenPrivacy }: AboutSheetProps) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} variant="page" onClose={onClose} className="about-sheet">
      {(close) => {
        // Close the sheet first (it pops its own history entry), then open the page,
        // so Back from /privacidad lands on Yo and not on a stale sheet entry.
        const toPrivacy = (event: MouseEvent<HTMLAnchorElement>) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          afterSheetPop(onOpenPrivacy);
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
                <div className="about__hero about__rise" style={order(0)}>
                  <div className="aguayo about__stripe" />
                  <img className="about__logo" src="/logo.svg" alt="" width={56} height={56} />
                  <p className="about__wordmark">BoliviaSabe</p>
                  <p className="about__tagline">{ABOUT.tagline}</p>
                  <p className="about__what">{ABOUT.what}</p>
                </div>

                <section className="about__block" aria-labelledby={`${titleId}-steps`}>
                  <h3 id={`${titleId}-steps`} className="about__heading about__rise" style={order(1)}>
                    {ABOUT.stepsTitle}
                  </h3>
                  <ol className="about__steps">
                    {ABOUT.steps.map((step, i) => (
                      <li key={step.title} className="about__step about__rise" style={order(2 + i)}>
                        <span className={`about__glyph about__glyph--${step.icon}`}>{STEP_ICON[step.icon]}</span>
                        <span>
                          <span className="about__step-title">{step.title}</span>
                          <span className="about__step-text">{step.text}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="about__block about__rise" style={order(5)} aria-labelledby={`${titleId}-team`}>
                  <h3 id={`${titleId}-team`} className="about__heading">Hecho por {ABOUT.team.org}</h3>
                  <ul className="about__team">
                    {ABOUT.team.people.map((name) => (
                      <li key={name}>
                        <span className="about__avatar" aria-hidden="true">{name[0]}</span>
                        {name}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="about__block about__rise" style={order(6)} aria-labelledby={`${titleId}-contact`}>
                  <h3 id={`${titleId}-contact`} className="about__heading">{ABOUT.contactLabel}</h3>
                  <p className="about__contact-text">{ABOUT.contactText}</p>
                  <a className="btn btn--full" href={`mailto:${CONTACT_EMAIL}`}>
                    <MailIcon size={20} /> Escríbenos
                  </a>
                  <p className="meta about__mail">{CONTACT_EMAIL}</p>
                  <a className="about__row" href="/privacidad" onClick={toPrivacy}>
                    <EyeIcon size={20} />
                    <span>Privacidad</span>
                    <ChevronRightIcon size={20} />
                  </a>
                </section>
                <p className="meta about__version">Versión del {BUILT}</p>
              </div>
            </div>
          </>
        );
      }}
    </Sheet>
  );
}
