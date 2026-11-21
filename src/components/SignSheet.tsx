// Letrero detail (wiki #139, #141): a page on a phone, a window over the grid on desktop.
// Holds every action of the letrero. «Me sirvió» is the main one and the moment that pays a
// neighbor a yapita, so it answers with the reward. On your own letrero the main action is
// sharing it (WhatsApp is how neighbors arrive).
import { useEffect, useId, useRef, useState } from 'react';
import { REPORT_REASONS, useHideForMe, useRemoveSign, useReport, useSign, useVoteSign, type ReportReason, type RewardCap, type Sign } from '../data';
import { useRequireAccount } from './AuthGate';
import {
  ArrowLeftIcon,
  BookmarkIcon,
  CloseIcon,
  FlagIcon,
  MapIcon,
  MoreIcon,
  PinIcon,
  ShareIcon,
  ThumbDownIcon,
  ThumbIcon,
  TrashIcon,
  CheckIcon,
} from './icons';
import { errorMessage, firstName, helpedText, rewardCapMessage } from './messages';
import { Sheet } from './Sheet';
import { isStale, timeAgo } from './time';
import { Yapita } from './Yapita';
import './sign-sheet.css';
import { FadeImage } from './FadeImage';

type SignSheetProps = {
  sign: Sign;
  /** The person was voting when «Crea tu cuenta» sent them to Google: send that vote on open (SPEC 07). */
  resumeVote?: 'helpful' | 'not_helpful';
  onClose: () => void;
  onToggleSave?: (sign: Sign) => void;
};

type View = 'detail' | 'photo' | 'report' | 'reported' | 'hidden' | 'confirm-delete' | 'deleted';

function mapsHref(sign: Sign): string {
  if (sign.mapsUrl) return sign.mapsUrl;
  const query = `${sign.title} ${sign.zone} ${sign.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function whatsappHref(sign: Sign): string {
  const link = `${window.location.origin}/l/${sign.id}`;
  const text = `${sign.title}${sign.price ? ` · ${sign.price}` : ''} · ${sign.zone}\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function SignSheet({ sign: initial, resumeVote, onClose, onToggleSave }: SignSheetProps) {
  const titleId = useId();
  const viewHeading = useRef<HTMLHeadingElement>(null);
  const fresh = useSign(initial.id);
  const [sign, setSign] = useState(initial);
  const [thanked, setThanked] = useState(false);
  /** Why the «Me sirvió» paid nothing (3 rewards today to the same person), or null when it paid. */
  const [rewardCap, setRewardCap] = useState<RewardCap | null>(null);
  const [sending, setSending] = useState(false);
  const thanksRef = useRef<HTMLParagraphElement>(null);
  const [view, setView] = useState<View>('detail');
  const [menu, setMenu] = useState(false);
  const menuTitleId = useId();
  const remove = useRemoveSign();
  const vote = useVoteSign();
  const requireAccount = useRequireAccount();
  const author = firstName(sign.author.displayName);

  // The server's copy wins once it arrives (after signing in, «isMine» and «myVote» change)
  useEffect(() => {
    if (fresh.data) setSign(fresh.data);
  }, [fresh.data]);

  // Each view change inside the sheet moves the focus to that view's heading
  useEffect(() => {
    if (view !== 'detail' && view !== 'photo') viewHeading.current?.focus();
  }, [view]);

  /** Runs `act` on the latest copy of the letrero; own letreros and earlier votes are never re-voted.
   * `sending` covers the whole round trip, so the button says «Enviando…» from the first tap. */
  const withLatest = (act: (latest: Sign) => void) => {
    setSending(true);
    return fresh.refetch().then(({ data }) => {
      const latest = data ?? sign;
      setSign(latest);
      if (!latest.isMine && latest.myVote === null) act(latest);
      else setSending(false);
    });
  };

  // The reward line takes the focus once it appears (the button it replaces is gone)
  useEffect(() => {
    if (thanked) thanksRef.current?.focus();
  }, [thanked]);

  // What each vote does once there is an account. The wall (below) and a vote resumed after Google
  // both run these.
  const sendHelpful = () =>
    withLatest((latest) =>
      vote.mutate(
        { id: latest.id, value: 'helpful' },
        {
          onSuccess: ({ sign: updated, rewardCap: cap }) => {
            setSign(updated);
            setRewardCap(cap);
            setThanked(true);
          },
          onSettled: () => setSending(false),
        },
      ),
    );

  const sendNotHelpful = () =>
    withLatest((latest) =>
      vote.mutate(
        { id: latest.id, value: 'not_helpful' },
        {
          onSuccess: ({ sign: updated }) => {
            setSign(updated);
            setView('detail');
          },
        },
      ),
    );

  const markHelpful = () =>
    requireAccount(`Así tu «Me sirvió» le da una yapita a ${author}.`, sendHelpful, undefined, {
      kind: 'vote-sign',
      id: sign.id,
      value: 'helpful',
    });

  const markNotHelpful = () =>
    requireAccount('Así nos cuentas qué letreros no sirven.', sendNotHelpful, undefined, {
      kind: 'vote-sign',
      id: sign.id,
      value: 'not_helpful',
    });

  // Back from Google with a vote in hand: send it once, as if the person had just tapped it
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumeVote || resumed.current) return;
    resumed.current = true;
    if (resumeVote === 'helpful') void sendHelpful();
    else void sendNotHelpful();
    // Runs once on open
  }, []);

  const toggleSave = () =>
    requireAccount(
      'Así guardas este letrero para verlo después.',
      () => {
        setSign((s) => ({ ...s, savedByMe: !s.savedByMe }));
        onToggleSave?.(sign);
      },
      undefined,
      { kind: 'save-sign', id: sign.id },
    );

  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <span id={titleId} className="sr-only">{sign.title}</span>
            {view === 'detail' ? (
              <button type="button" className="icon-btn" aria-label="Volver" onClick={close}>
                <ArrowLeftIcon className="sheet__icon-phone" />
                <CloseIcon className="sheet__icon-desk" />
              </button>
            ) : (
              <button type="button" className="icon-btn" aria-label="Volver al letrero" onClick={() => setView('detail')}>
                <ArrowLeftIcon />
              </button>
            )}
            <span className="sheet__bar-actions" hidden={view !== 'detail'}>
              {!sign.isMine && (
                <a className="icon-btn" href={whatsappHref(sign)} target="_blank" rel="noreferrer" aria-label="Compartir por WhatsApp">
                  <ShareIcon />
                </a>
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={sign.savedByMe ? 'Quitar de guardados' : 'Guardar'}
                aria-pressed={sign.savedByMe}
                onClick={toggleSave}
              >
                <BookmarkIcon fill={sign.savedByMe ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="icon-btn" aria-label="Más opciones" aria-haspopup="dialog" onClick={() => setMenu(true)}>
                <MoreIcon />
              </button>
            </span>
          </header>

          {view === 'photo' ? (
            <button type="button" className="sheet__zoom" aria-label="Cerrar la foto" onClick={() => setView('detail')}>
              <FadeImage key={sign.photoUrl} src={sign.photoUrl} alt={sign.title} />
            </button>
          ) : view === 'report' ? (
            <ReportView sign={sign} headingRef={viewHeading} onDone={(how) => setView(how)} />
          ) : view === 'confirm-delete' ? (
            <div className="sheet__body">
              <div className="sheet__content empty">
                <h2 ref={viewHeading} tabIndex={-1} className="empty__title">¿Borrar este letrero?</h2>
                <p className="empty__text">«{sign.title}» desaparece de Hoy para todos. No se puede deshacer.</p>
                {remove.error && <p className="field__error" role="alert">{errorMessage(remove.error)}</p>}
                <div className="confirm__actions">
                  <button type="button" className="btn btn--secondary" onClick={() => setView('detail')}>No, dejarlo</button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(sign.id, { onSuccess: () => setView('deleted') })}
                  >
                    {remove.isPending ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            </div>
          ) : view === 'deleted' ? (
            <div className="sheet__body">
              <div className="sheet__content empty" role="status">
                <h2 ref={viewHeading} tabIndex={-1} className="empty__title">Letrero borrado</h2>
                <p className="empty__text">Ya no aparece en Hoy.</p>
                <button type="button" className="btn btn--secondary" onClick={close}>Volver a Hoy</button>
              </div>
            </div>
          ) : view === 'reported' || view === 'hidden' ? (
            <div className="sheet__body">
              <div className="sheet__content empty" role="status">
                <h2 ref={viewHeading} tabIndex={-1} className="empty__title">
                  {view === 'reported' ? 'Gracias por avisar' : 'Listo, ya no lo verás'}
                </h2>
                <p className="empty__text">
                  {view === 'reported'
                    ? 'Ya no lo verás. Lo revisamos y, si más vecinos lo reportan, se oculta para todos.'
                    : 'Este letrero desaparece de tus listas. Nadie más se entera.'}
                </p>
                <button type="button" className="btn btn--secondary" onClick={close}>Volver a Hoy</button>
              </div>
            </div>
          ) : (
            <div className="sheet__body">
              <button type="button" className="sheet__photo" aria-label="Ver la foto completa" onClick={() => setView('photo')}>
                {/* The frame pulses while the full photo loads, then the photo fades in (wiki #196). The hidden
                    thumbnail, usually cached from the grid, only gives the frame its final size */}
                <span className="sheet__photo-frame">
                  <img className="sheet__photo-thumb" src={sign.thumbUrl} alt="" aria-hidden="true" crossOrigin="anonymous" />
                  <FadeImage key={sign.photoUrl} className="sheet__photo-full" src={sign.photoUrl} alt={sign.title} />
                </span>
              </button>
              <div className="sheet__info">
                {sign.price && <p className="letrero-price">{sign.price}</p>}
                <h2 className="sheet__title">{sign.title}</h2>
                <p className="meta meta--icon">
                  <PinIcon size={16} />
                  <span>{sign.zone}, {sign.city}</span>
                </p>
                <p className="meta">
                  {sign.isMine ? 'Lo subiste tú' : `Subido por ${sign.author.displayName}`} · {timeAgo(sign.createdAt)}
                </p>
                {sign.helpfulCount > 0 && <p className="meta">{helpedText(sign.helpfulCount)}</p>}
                {isStale(sign.createdAt) && <p className="notice">Puede estar desactualizado</p>}
                {sign.tags.length > 0 && (
                  <p className="sheet__tags">
                    {sign.tags.map((t) => (
                      <span key={t} className="tag">{t}</span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          )}

          {view === 'detail' && (
            <footer className="sheet__actions">
              {thanked && (
                <p ref={thanksRef} tabIndex={-1} className="sheet__message sheet__thanks" role="status">
                  <Yapita size="lg" />
                  <span>
                    <strong>¡Gracias, pues!</strong>
                    <span>{rewardCapMessage(rewardCap, author) ?? `${author} recibe +1 yapita por ayudarte.`}</span>
                  </span>
                </p>
              )}
              {vote.error && !thanked && (
                <p className="sheet__message sheet__message--error" role="alert">{errorMessage(vote.error)}</p>
              )}
              {sign.isMine ? (
                <a className="btn" href={whatsappHref(sign)} target="_blank" rel="noreferrer" aria-label="Compartir por WhatsApp">
                  <ShareIcon size={20} /> Compartir
                </a>
              ) : sign.myVote === null ? (
                <button type="button" className="btn" disabled={sending} onClick={markHelpful}>
                  <ThumbIcon size={20} /> {sending ? 'Enviando…' : 'Me sirvió'}
                </button>
              ) : (
                // Already voted: a marked state, never a dead filled button
                <p className="sheet__voted" tabIndex={0}>
                  {sign.myVote === 'helpful' ? <CheckIcon size={20} /> : <ThumbDownIcon size={20} />}
                  {sign.myVote === 'helpful' ? 'Te sirvió' : 'No te sirvió'}
                </p>
              )}
              <a className="btn btn--secondary" href={mapsHref(sign)} target="_blank" rel="noreferrer">
                <MapIcon size={20} /> Cómo llegar
              </a>
            </footer>
          )}

          {menu && (
            <Sheet labelledBy={menuTitleId} variant="bottom" onClose={() => setMenu(false)}>
              {(closeMenu) => {
                // Close the menu first (it owns a history entry), then act on the detail
                const then = (act: () => void) => {
                  closeMenu();
                  window.setTimeout(act, 180);
                };
                return (
                  <>
                    <header className="sheet__bar">
                      <h2 id={menuTitleId} className="sheet__bar-title">
                        Más opciones <span className="meta sheet__bar-sub">{sign.title}</span>
                      </h2>
                      <button type="button" className="icon-btn" aria-label="Cerrar" onClick={closeMenu}>
                        <CloseIcon />
                      </button>
                    </header>
                    <ul className="menu">
                      {sign.isMine ? (
                        <li>
                          <button type="button" className="menu__item menu__item--danger" onClick={() => then(() => setView('confirm-delete'))}>
                            <TrashIcon size={20} /> Borrar letrero
                          </button>
                        </li>
                      ) : (
                        <>
                          {sign.myVote === null && (
                            <li>
                              <button type="button" className="menu__item" onClick={() => then(markNotHelpful)}>
                                <ThumbDownIcon size={20} /> No me sirvió
                              </button>
                            </li>
                          )}
                          <li>
                            <button
                              type="button"
                              className="menu__item"
                              onClick={() => then(() => requireAccount('Así nos avisas de algo que no debería estar.', () => setView('report')))}
                            >
                              <FlagIcon size={20} /> Reportar
                            </button>
                          </li>
                        </>
                      )}
                    </ul>
                  </>
                );
              }}
            </Sheet>
          )}
        </>
      )}
    </Sheet>
  );
}

function ReportView({
  sign,
  headingRef,
  onDone,
}: {
  sign: Sign;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDone: (how: 'reported' | 'hidden') => void;
}) {
  const [reason, setReason] = useState<ReportReason | 'hide' | null>(null);
  const report = useReport();
  const hide = useHideForMe();
  const pending = report.isPending || hide.isPending;
  const error = report.error ?? hide.error;

  return (
    <div className="sheet__body">
      <form
        className="sheet__content report"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason === 'hide') hide.mutate({ kind: 'sign', id: sign.id }, { onSuccess: () => onDone('hidden') });
          else if (reason) report.mutate({ kind: 'sign', id: sign.id, reason }, { onSuccess: () => onDone('reported') });
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} className="report__title">
          Reportar <span className="meta">{sign.title}</span>
        </h2>
        <fieldset className="report__set">
          <legend className="report__legend">¿Qué pasa con este letrero?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="radio-row">
              <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              <span>{r.label}</span>
            </label>
          ))}
          <label className="radio-row">
            <input type="radio" name="reason" value="hide" checked={reason === 'hide'} onChange={() => setReason('hide')} />
            <span>
              Ya no quiero ver esto <span className="meta">(solo te lo oculta a ti)</span>
            </span>
          </label>
        </fieldset>
        {error && <p className="field__error" role="alert">{errorMessage(error)}</p>}
        <button type="submit" className={reason ? 'btn btn--full' : 'btn btn--secondary btn--full'} disabled={!reason || pending}>
          {pending ? 'Enviando…' : reason === 'hide' ? 'Ocultar este letrero' : reason ? 'Enviar reporte' : 'Elige una opción'}
        </button>
      </form>
    </div>
  );
}
