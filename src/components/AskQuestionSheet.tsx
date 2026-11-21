// «Preguntar» (wiki › flujo-final › 2, SPEC 10): «¿Qué necesitas?», «Preguntas parecidas», an optional photo,
// Urgente (−5) and «Más detalles». It checks the limits first. What is typed lives in memory while the sheet is
// open, so a failed publish or no signal never loses it (the account is asked before it opens).
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  MAX_TAGS,
  SUGGESTED_ZONES,
  TAGS,
  useCreateQuestion,
  useMyQuestions,
  useSession,
  useSimilarQuestions,
  useWallet,
  type City,
  type Id,
  type Question,
  type Tag,
} from '../data';
import { ArrowLeftIcon, ChevronDownIcon, CloseIcon } from './icons';
import { errorMessage, limitMessage } from './messages';
import { PhotoError, preparePhoto } from './photo';
import { QuestionCard } from './QuestionCard';
import { QuestionDetail } from './QuestionDetail';
import { askLimit, urgentBlocker, URGENT_COST } from './questionLimits';
import { Sheet } from './Sheet';
import './upload-sign-sheet.css';
import './ask-question-sheet.css';

const TEXT_MIN = 3;
const TEXT_MAX = 300;

type AskQuestionSheetProps = {
  /** The city in the top bar: a question is published in the profile's city. */
  viewingCity: City;
  /** Text already written («Preguntar esto» from an empty search). */
  initialText?: string;
  onClose: () => void;
  /** The new question; `urgentCharged` is false when it was urgent and the −5 could not be charged. */
  onPublished: (result: { question: Question; urgentCharged: boolean; urgent: boolean }) => void;
  /** Opens one of the person's questions (from the «Cierra una de tus preguntas» list). */
  onOpenQuestion: (id: Id) => void;
};

type Photo = { photo: Blob; url: string };

export function AskQuestionSheet({ viewingCity, initialText = '', onClose, onPublished, onOpenQuestion }: AskQuestionSheetProps) {
  const titleId = useId();
  const fieldId = useId();
  const session = useSession();
  const profile = session.data?.status === 'signed-in' ? session.data.profile : null;
  const city = profile?.city ?? viewingCity;
  const defaultZone = profile?.zone ?? '';
  const mine = useMyQuestions();
  const wallet = useWallet({ enabled: true });
  const create = useCreateQuestion();

  const [view, setView] = useState<'form' | 'confirm'>('form');
  const [confirmLeaving, setConfirmLeaving] = useState(false);
  const [text, setText] = useState(initialText);
  const [zone, setZone] = useState(defaultZone);
  const [tags, setTags] = useState<Tag[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [peek, setPeek] = useState<Id | null>(null);
  const [touched, setTouched] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  const similar = useSimilarQuestions(text);
  const trimmed = text.trim();
  const limit = mine.data ? askLimit(mine.data) : null;
  const blocker = urgentBlocker(mine.data ?? [], wallet.data?.balance ?? null);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  useEffect(() => {
    if (view === 'confirm') confirmHeading.current?.focus();
  }, [view]);

  // Urgente turns itself off when it stops being possible (e.g. the balance finished loading short)
  useEffect(() => {
    if (urgent && blocker) setUrgent(false);
  }, [urgent, blocker]);

  const keepEditing = () => {
    if (confirmLeaving) return;
    setConfirmLeaving(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      setView('form');
      setConfirmLeaving(false);
    }, reduced ? 0 : 160);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ photo: prepared.photo, url: URL.createObjectURL(prepared.photo) });
    } catch (error) {
      setPhotoError(
        error instanceof PhotoError && error.reason === 'too-big' ? 'Esa foto pesa más de 10 MB, elige otra' : 'Eso no es una foto, elige otra',
      );
    } finally {
      setPreparing(false);
    }
  };

  const toggleTag = (tag: Tag) =>
    setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : current.length < MAX_TAGS ? [...current, tag] : current));

  const textShort = trimmed.length > 0 && trimmed.length < TEXT_MIN;
  const missing = trimmed.length === 0 ? 'Falta lo que necesitas' : textShort ? 'Escribe al menos 3 letras' : null;
  const canPublish = !missing && !create.isPending && !preparing && !limit && !mine.isPending;
  const dirty = trimmed !== '' || Boolean(photo) || urgent || tags.length > 0 || zone.trim() !== defaultZone.trim();

  const canClose = () => {
    if (create.isPending) return false;
    if (view === 'confirm') {
      keepEditing();
      return false;
    }
    if (dirty && !limit) {
      setView('confirm');
      return false;
    }
    return true;
  };

  const limitText = limitMessage(create.error);

  return (
    <Sheet labelledBy={titleId} onClose={onClose} canClose={canClose} className="upload ask">
      {(close, forceClose) => {
        const publish = () => {
          if (!canPublish) return;
          create.mutate(
            { text: trimmed, photo: photo?.photo, urgent, zone: zone.trim() || undefined, tags },
            {
              onSuccess: (result) => {
                onPublished({ ...result, urgent });
                forceClose();
              },
            },
          );
        };

        return (
          <>
            <header className="sheet__bar">
              <button type="button" className="icon-btn" aria-label="Volver" onClick={close}>
                <ArrowLeftIcon className="sheet__icon-phone" />
                <CloseIcon className="sheet__icon-desk" />
              </button>
              <h2 id={titleId} className="sheet__bar-title">Preguntar</h2>
            </header>

            {limit ? (
              <div className="sheet__body">
                <div className="sheet__content upload__form">
                  <div className="empty">
                    <h3 className="empty__title">
                      {limit.kind === 'day' ? 'Llegaste al límite de hoy' : 'Cierra una de tus preguntas para hacer otra'}
                    </h3>
                    <p className="empty__text">
                      {limit.kind === 'day'
                        ? 'Puedes volver a hacerlo mañana.'
                        : 'Tienes 3 preguntas abiertas con respuestas. Si alguna te sirvió, dale «Me sirvió»; si ninguna, ciérrala.'}
                    </p>
                  </div>
                  {limit.kind === 'open' && (
                    <ul className="qlist">
                      {limit.questions.map((q) => (
                        <li key={q.id}>
                          <QuestionCard
                            question={q}
                            onOpen={() => {
                              forceClose();
                              onOpenQuestion(q.id);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="sheet__body" inert={view === 'confirm'}>
                  <div className="sheet__content upload__form">
                    <div className="field">
                      <div className="upload__label-row">
                        <label htmlFor={`${fieldId}-text`}>¿Qué necesitas?</label>
                        <span className="meta" aria-hidden="true">{text.length}/{TEXT_MAX}</span>
                      </div>
                      <textarea
                        id={`${fieldId}-text`}
                        className="input input--box ask__text"
                        rows={4}
                        maxLength={TEXT_MAX}
                        placeholder="Ej.: ¿Dónde hay una farmacia de turno?"
                        value={text}
                        aria-invalid={touched && textShort ? true : undefined}
                        aria-describedby={touched && textShort ? `${fieldId}-text-error` : undefined}
                        onBlur={() => setTouched(true)}
                        onChange={(e) => setText(e.target.value)}
                      />
                      {touched && textShort && <p id={`${fieldId}-text-error`} className="field__error">Escribe al menos 3 letras</p>}
                    </div>

                    {(similar.data?.length ?? 0) > 0 && (
                      <section className="ask__similar" aria-labelledby={`${fieldId}-similar`}>
                        <h3 id={`${fieldId}-similar`} className="upload__label">Preguntas parecidas</h3>
                        <ul className="qlist">
                          {similar.data?.map((q) => (
                            <li key={q.id}>
                              <QuestionCard question={q} onOpen={() => setPeek(q.id)} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    <section className="upload__photo" aria-labelledby={`${fieldId}-photo`}>
                      <h3 id={`${fieldId}-photo`} className="upload__label">Foto <span className="meta">(opcional)</span></h3>
                      {photo ? (
                        <div key={photo.url} className="upload__preview">
                          <img src={photo.url} alt="Foto de la pregunta" />
                          <button type="button" className="btn btn--secondary btn--small upload__change" disabled={preparing} onClick={() => setPhoto(null)}>
                            Quitar foto
                          </button>
                        </div>
                      ) : (
                        <div className="upload__pick" aria-busy={preparing || undefined}>
                          <button type="button" className="btn btn--secondary btn--full" disabled={preparing} onClick={() => cameraRef.current?.click()}>
                            {preparing ? 'Preparando la foto…' : 'Tomar foto'}
                          </button>
                          <button type="button" className="btn btn--secondary btn--full" disabled={preparing} onClick={() => galleryRef.current?.click()}>
                            Elegir de la galería
                          </button>
                        </div>
                      )}
                      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                      <input ref={galleryRef} className="sr-only" type="file" accept="image/*" tabIndex={-1} aria-hidden="true" onChange={onFile} />
                      {photoError && <p className="field__error" role="alert">{photoError}</p>}
                    </section>

                    <div className="ask__urgent">
                      <label className="ask__switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={urgent}
                          disabled={Boolean(blocker)}
                          aria-describedby={`${fieldId}-urgent-note`}
                          onChange={(e) => setUrgent(e.target.checked)}
                        />
                        <span className="ask__switch-text">
                          <strong>Urgente (−{URGENT_COST} yapitas)</strong>
                          <span id={`${fieldId}-urgent-note`} className="meta">
                            {blocker ?? 'Tu pregunta queda arriba durante 24 horas.'}
                          </span>
                        </span>
                      </label>
                    </div>

                    <button
                      type="button"
                      className="upload__more"
                      aria-expanded={detailsOpen}
                      aria-controls={`${fieldId}-details`}
                      onClick={() => setDetailsOpen((open) => !open)}
                    >
                      Más detalles
                      <ChevronDownIcon size={20} />
                    </button>

                    <div id={`${fieldId}-details`} className="upload__details" data-open={detailsOpen || undefined} inert={!detailsOpen}>
                      <div className="upload__details-inner">
                        <div className="field">
                          <label htmlFor={`${fieldId}-zone`}>Zona</label>
                          <input
                            id={`${fieldId}-zone`}
                            className="input input--box"
                            type="text"
                            list={`${fieldId}-zones`}
                            autoComplete="off"
                            value={zone}
                            onChange={(e) => setZone(e.target.value)}
                          />
                          <datalist id={`${fieldId}-zones`}>
                            {SUGGESTED_ZONES[city].map((z) => (
                              <option key={z} value={z} />
                            ))}
                          </datalist>
                        </div>
                        <fieldset className="upload__tags">
                          <legend>Etiquetas <span className="meta">(hasta {MAX_TAGS})</span></legend>
                          <div className="upload__chips">
                            {TAGS.map((tag) => {
                              const on = tags.includes(tag);
                              return (
                                <button key={tag} type="button" className="chip" aria-pressed={on} disabled={!on && tags.length >= MAX_TAGS} onClick={() => toggleTag(tag)}>
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sheet__actions" inert={view === 'confirm'}>
                  {create.isError ? (
                    <p key="error" className="sheet__message sheet__message--error upload__msg" role="alert">
                      {limitText ?? (errorMessage(create.error) === 'Algo falló, intenta de nuevo' ? 'No pudimos publicarla, intenta de nuevo' : errorMessage(create.error))}
                    </p>
                  ) : missing ? (
                    <p key={missing} className="sheet__message upload__msg" id={`${fieldId}-blocker`}>{missing}</p>
                  ) : city !== viewingCity ? (
                    <p key="city" className="sheet__message upload__msg">Se publicará en {city}</p>
                  ) : null}
                  <button
                    type="button"
                    className="btn sheet__full"
                    disabled={!canPublish}
                    aria-describedby={missing ? `${fieldId}-blocker` : undefined}
                    onClick={publish}
                  >
                    {create.isPending ? (
                      <>
                        <span className="upload__spinner" aria-hidden="true" /> Publicando…
                      </>
                    ) : create.isError && !limitText ? (
                      'Reintentar'
                    ) : urgent ? (
                      `Publicar y pagar ${URGENT_COST} yapitas`
                    ) : (
                      'Publicar'
                    )}
                  </button>
                </div>
              </>
            )}

            {view === 'confirm' && (
              <div className="upload__confirm" data-leaving={confirmLeaving || undefined}>
                <div className="upload__confirm-scrim" aria-hidden="true" onClick={keepEditing} />
                <div className="upload__confirm-card" role="alertdialog" aria-labelledby={`${fieldId}-confirm`} aria-describedby={`${fieldId}-confirm-text`}>
                  <h3 id={`${fieldId}-confirm`} ref={confirmHeading} tabIndex={-1} className="upload__confirm-title">¿Descartar la pregunta?</h3>
                  <p id={`${fieldId}-confirm-text`} className="upload__confirm-text">Se borran la foto y lo que escribiste.</p>
                  <div className="confirm__actions">
                    <button type="button" className="btn btn--secondary" onClick={keepEditing}>Seguir editando</button>
                    <button type="button" className="btn btn--danger" onClick={forceClose}>Descartar</button>
                  </div>
                </div>
              </div>
            )}

            {peek !== null && <PeekQuestion id={peek} onClose={() => setPeek(null)} />}
          </>
        );
      }}
    </Sheet>
  );
}

/** A similar question opened over the form, so what was typed stays where it is. */
function PeekQuestion({ id, onClose }: { id: Id; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <button type="button" className="icon-btn" aria-label="Volver a tu pregunta" onClick={close}>
              <ArrowLeftIcon className="sheet__icon-phone" />
              <CloseIcon className="sheet__icon-desk" />
            </button>
            <h2 id={titleId} className="sheet__bar-title">Pregunta parecida</h2>
          </header>
          <div className="sheet__body">
            <div className="sheet__content">
              <QuestionDetail id={id} variant="panel" onGone={close} />
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
