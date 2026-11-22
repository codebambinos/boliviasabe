// «Pedir contacto» on an answer (wiki › flujo-final › «Detalle», #182-#184). The asker asks with a secondary button
// next to «Me sirvió»; the person asked sees it inside their own answer with Aceptar / Ahora no; once accepted, both
// see the other's e-mail and, if given, phone in a box only they receive. The phone field is optional and is
// prefilled with the one saved in the profile.
import { useEffect, useId, useState } from 'react';
import { isDataError, useMyPhone, useRequestContact, useRespondContact, type Answer, type ContactDetails, type Question } from '../data';
import { ArrowLeftIcon, CheckIcon, CloseIcon, ContactIcon, CopyIcon, MailIcon, PhoneIcon } from './icons';
import { errorMessage } from './messages';
import { Sheet } from './Sheet';
import './contact-request.css';

/** The asker may ask on someone else's answer to their question, once. */
export const canRequestContact = (question: Question, answer: Answer) => question.isMine && !answer.isMine && answer.contact === null;

export function phoneError(error: unknown): string | null {
  if (!error) return null;
  if (isDataError(error) && error.code === 'validation') return 'Revisa el número: solo números, espacios y un + al inicio';
  return errorMessage(error);
}

export function PhoneField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="contact__field">
      <label htmlFor={id} className="contact__label">Tu celular (opcional)</label>
      <input
        id={id}
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={20}
        placeholder="70000000"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The phone saved in the profile, once, as the starting value of the field. */
function useSavedPhone(): [string, (value: string) => void] {
  const saved = useMyPhone();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && saved.data) setPhone(saved.data);
  }, [saved.data, touched]);
  return [
    phone,
    (value) => {
      setTouched(true);
      setPhone(value);
    },
  ];
}

/** «Pedir contacto» button for the answer's action row. */
export function RequestContactButton({ question, answer }: { question: Question; answer: Answer }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
        <ContactIcon size={18} /> Pedir contacto
      </button>
      {open && <RequestSheet question={question} answer={answer} onClose={() => setOpen(false)} />}
    </>
  );
}

function RequestSheet({ question, answer, onClose }: { question: Question; answer: Answer; onClose: () => void }) {
  const titleId = useId();
  const fieldId = useId();
  const request = useRequestContact();
  const [phone, setPhone] = useSavedPhone();
  const name = answer.author.displayName;

  return (
    // Full screen on a phone, as every sheet with a field: a bottom sheet with the keyboard open lets iOS scroll the
    // page behind it, and the taps then land there instead of on «Pedir contacto»
    <Sheet labelledBy={titleId} onClose={onClose} canClose={() => !request.isPending}>
      {(close, forceClose) => (
        <>
          <header className="sheet__bar">
            <button type="button" className="icon-btn" aria-label="Volver" onClick={close}>
              <ArrowLeftIcon className="sheet__icon-phone" />
              <CloseIcon className="sheet__icon-desk" />
            </button>
            <h2 id={titleId} className="sheet__bar-title">Pedir contacto a {name}</h2>
          </header>
          <div className="sheet__body">
            <form
              className="sheet__content contact__sheet"
              onSubmit={(e) => {
                e.preventDefault();
                if (request.isPending) return;
                request.mutate({ answerId: answer.id, questionId: question.id, phone }, { onSuccess: forceClose });
              }}
            >
              <p className="empty__text">Si acepta, los dos verán el dato del otro: tu correo y, si lo pones, tu celular.</p>
              <PhoneField id={fieldId} value={phone} onChange={setPhone} />
              {request.error && <p className="field__error" role="alert">{phoneError(request.error)}</p>}
              <button type="submit" className="btn btn--full" disabled={request.isPending}>
                {request.isPending ? 'Enviando…' : 'Pedir contacto'}
              </button>
            </form>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** What the contact request looks like inside the answer, for each of the two people. Nothing for anyone else. */
export function ContactPanel({ question, answer }: { question: Question; answer: Answer }) {
  const contact = answer.contact;
  if (!contact) return null;

  if (contact.status === 'accepted' && contact.other) {
    const name = contact.requestedByMe ? answer.author.displayName : question.author.displayName;
    return <ContactBox name={name} details={contact.other} />;
  }
  if (contact.requestedByMe) {
    return (
      <p className="contact__status" role="status">
        {contact.status === 'pending' ? 'Esperando que acepte' : 'Prefirió no compartir su contacto'}
      </p>
    );
  }
  if (contact.status === 'pending') return <IncomingRequest question={question} requestId={contact.requestId} />;
  return null;
}

function IncomingRequest({ question, requestId }: { question: Question; requestId: number }) {
  const fieldId = useId();
  const respond = useRespondContact();
  const [phone, setPhone] = useSavedPhone();
  const answer = (accept: boolean) => respond.mutate({ requestId, questionId: question.id, accept, phone: accept ? phone : undefined });
  const busy = respond.isPending;

  return (
    <section className="contact__incoming" aria-label="Pedido de contacto">
      <p className="contact__title">{question.author.displayName} te pidió tu contacto</p>
      <p className="meta">Si aceptas, los dos verán el dato del otro.</p>
      <PhoneField id={fieldId} value={phone} onChange={setPhone} />
      {respond.error && <p className="field__error" role="alert">{phoneError(respond.error)}</p>}
      <div className="contact__buttons">
        <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={() => answer(false)}>
          Ahora no
        </button>
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => answer(true)}>
          {busy && respond.variables?.accept ? 'Enviando…' : 'Aceptar'}
        </button>
      </div>
    </section>
  );
}

function ContactBox({ name, details }: { name: string; details: ContactDetails }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 2000);
    } catch {
      /* no clipboard (an old browser or no permission): the text is on screen to select */
    }
  };

  const row = (value: string, action: { href: string; label: string; icon: React.ReactNode }) => (
    <li className="contact__row">
      <span className="contact__value">{value}</span>
      <span className="contact__actions">
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void copy(value)}>
          {copied === value ? (
            <>
              <CheckIcon size={16} /> Copiado
            </>
          ) : (
            <>
              <CopyIcon size={16} /> Copiar
            </>
          )}
        </button>
        <a className="btn btn--small" href={action.href}>
          {action.icon} {action.label}
        </a>
      </span>
    </li>
  );

  return (
    <section className="contact__box" aria-label={`Contacto de ${name}`}>
      <p className="contact__title">Contacto de {name}</p>
      <ul className="contact__list">
        {details.phone && row(details.phone, { href: `tel:${details.phone.replace(/[^+0-9]/g, '')}`, label: 'Llamar', icon: <PhoneIcon size={16} /> })}
        {row(details.email, { href: `mailto:${details.email}`, label: 'Escribir correo', icon: <MailIcon size={16} /> })}
      </ul>
      <p className="sr-only" role="status">{copied ? 'Copiado' : ''}</p>
    </section>
  );
}
