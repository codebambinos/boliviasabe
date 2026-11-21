// A question and its answers (wiki › flujo-final › «2 · ¿Alguien sabe?», SPEC 10). One component, two homes:
// the page `/p/:id` on a phone and the side panel on desktop. It holds every action of the conversation:
// Guardar, Compartir, ⋯ (Reportar · Borrar) and, later steps, answering and rating.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  REPORT_REASONS,
  isDataError,
  useHideForMe,
  useQuestion,
  useRemoveAnswer,
  useRemoveQuestion,
  useReport,
  useToggleSaved,
  type Answer,
  type Author,
  type Id,
  type Question,
  type ReportReason,
} from '../data';
import { useRequireAccount } from './AuthGate';
import { BookmarkIcon, CheckIcon, CloseIcon, FlagIcon, MoreIcon, ShareIcon, TrashIcon } from './icons';
import { errorMessage } from './messages';
import { answersText, isUrgentActive } from './QuestionCard';
import { Sheet } from './Sheet';
import { timeAgo } from './time';
import './sign-sheet.css';
import './question-detail.css';

type Target = { type: 'question' } | { type: 'answer'; answer: Answer };
type Dialog = { kind: 'menu' | 'report' | 'delete' | 'reported' | 'hidden' | 'deleted'; target: Target } | { kind: 'photo' };

type QuestionDetailProps = {
  id: Id;
  /** `page`: the standalone page on a phone (its text is the page's h1). `panel`: the desktop side panel. */
  variant: 'page' | 'panel';
  /** After the question was deleted: leave the conversation (back on a phone, close the panel on desktop). */
  onGone: () => void;
};

const stars = (value: number) => value.toFixed(1).replace('.', ',');

function whatsappHref(question: Question): string {
  const link = `${window.location.origin}/p/${question.id}`;
  return `https://wa.me/?text=${encodeURIComponent(`${question.text}\n${link}`)}`;
}

function AuthorLine({ author, mine, when, prefix }: { author: Author; mine: boolean; when: string; prefix?: string }) {
  return (
    <p className="meta qd__author">
      <span>{mine ? `${prefix ?? ''}tú` : author.displayName}</span>
      {!mine && (
        <span className="qd__badge">
          {author.badge}
          {author.stars !== null && ` · ★ ${stars(author.stars)}`}
        </span>
      )}
      <span>· {when}</span>
    </p>
  );
}

export function QuestionDetail({ id, variant, onGone }: QuestionDetailProps) {
  const detail = useQuestion(id);
  const requireAccount = useRequireAccount();
  const toggleSaved = useToggleSaved();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = variant === 'page' ? 'h1' : 'h2';

  // A conversation opened from the panel takes the focus on its text
  useEffect(() => {
    if (variant === 'panel' && detail.data) heading.current?.focus({ preventScroll: true });
  }, [variant, id, detail.isSuccess]);

  if (detail.isPending) {
    return (
      <div className="qd" aria-busy="true">
        <p className="sr-only" role="status">Cargando la pregunta…</p>
        <div className="skeleton" style={{ height: '1.25rem', width: '90%' }} />
        <div className="skeleton" style={{ height: '1.25rem', marginTop: 'var(--s-2)', width: '70%' }} />
        <div className="skeleton" style={{ height: '5rem', marginTop: 'var(--s-5)' }} />
      </div>
    );
  }

  if (detail.isError) {
    const gone = isDataError(detail.error) && detail.error.code === 'not_found';
    return (
      <div className="qd">
        <div className="empty" role="alert">
          <Heading ref={heading} tabIndex={-1} className="empty__title">{gone ? 'Esto ya no está disponible' : errorMessage(detail.error)}</Heading>
          {gone ? (
            variant === 'page' && <Link className="btn" to="/" replace>Ir a Hoy</Link>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => detail.refetch()}>Reintentar</button>
          )}
        </div>
      </div>
    );
  }

  const { question, answers } = detail.data;
  const urgent = question.status === 'open' && isUrgentActive(question);

  const saveQuestion = () =>
    requireAccount(
      'Así guardas esta pregunta para verla después.',
      () => toggleSaved.mutate({ kind: 'question', id: question.id }),
      undefined,
      { kind: 'save-question', id: question.id },
    );
  const saveAnswer = (answer: Answer) =>
    requireAccount(
      'Así guardas esta respuesta para verla después.',
      () => toggleSaved.mutate({ kind: 'answer', id: answer.id }),
      undefined,
      { kind: 'save-answer', id: answer.id },
    );

  const canDeleteQuestion = question.isMine && question.answerCount === 0;
  const hasQuestionMenu = !question.isMine || canDeleteQuestion;
  const openMenu = (target: Target) => setDialog({ kind: 'menu', target });

  return (
    <div className="qd">
      <header className="qd__head">
        <p className="qd__tags">
          {question.status === 'solved' && (
            <span className="tag tag--ok">
              <CheckIcon size={14} /> Solucionada
            </span>
          )}
          {question.status === 'closed' && <span className="tag tag--muted">Cerrada</span>}
          {urgent && <span className="tag tag--urgent">Urgente</span>}
          <span className="meta">{question.zone}, {question.city}</span>
        </p>
        <Heading ref={heading} tabIndex={-1} className="qd__text">{question.text}</Heading>
        <AuthorLine author={question.author} mine={question.isMine} when={timeAgo(question.createdAt)} prefix="Lo preguntaste " />
        {question.photoUrl && (
          <button type="button" className="qd__photo" aria-label="Ver la foto completa" onClick={() => setDialog({ kind: 'photo' })}>
            <img src={question.photoUrl} alt="Foto de la pregunta" />
          </button>
        )}
        <div className="qd__actions">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            aria-pressed={question.savedByMe}
            onClick={saveQuestion}
          >
            <BookmarkIcon size={18} fill={question.savedByMe ? 'currentColor' : 'none'} /> {question.savedByMe ? 'Guardada' : 'Guardar'}
          </button>
          <a className="btn btn--secondary btn--small" href={whatsappHref(question)} target="_blank" rel="noreferrer" aria-label="Compartir por WhatsApp">
            <ShareIcon size={18} /> Compartir
          </a>
          {hasQuestionMenu && (
            <button type="button" className="icon-btn qd__more" aria-label="Más opciones de la pregunta" aria-haspopup="dialog" onClick={() => openMenu({ type: 'question' })}>
              <MoreIcon />
            </button>
          )}
        </div>
      </header>

      <section className="qd__answers" aria-labelledby={`${variant}-answers`}>
        <h3 id={`${variant}-answers`} className="qd__section">{answersText(answers.length)}</h3>
        {answers.length === 0 ? (
          <div className="qd__empty">
            <p className="qd__empty-title">Todavía nadie respondió</p>
            <p className="meta">Compártela en tus grupos para que te vean más vecinos.</p>
          </div>
        ) : (
          <ul className="qd__list">
            {answers.map((answer) => {
              const canDelete = answer.isMine && !answer.helpful;
              const hasMenu = !answer.isMine || canDelete;
              return (
                <li key={answer.id} className="answer" data-helpful={answer.helpful || undefined}>
                  <AuthorLine author={answer.author} mine={answer.isMine} when={timeAgo(answer.createdAt)} prefix="Lo respondiste " />
                  <p className="answer__text">{answer.text}</p>
                  {answer.helpful && (
                    <p className="answer__marked">
                      <CheckIcon size={16} /> {question.isMine ? 'Te sirvió' : 'Le sirvió a quien preguntó'}
                    </p>
                  )}
                  <div className="answer__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={answer.savedByMe ? 'Quitar la respuesta de guardados' : 'Guardar la respuesta'}
                      aria-pressed={answer.savedByMe}
                      onClick={() => saveAnswer(answer)}
                    >
                      <BookmarkIcon size={20} fill={answer.savedByMe ? 'currentColor' : 'none'} />
                    </button>
                    {hasMenu && (
                      <button type="button" className="icon-btn" aria-label="Más opciones de la respuesta" aria-haspopup="dialog" onClick={() => openMenu({ type: 'answer', answer })}>
                        <MoreIcon />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {dialog?.kind === 'photo' && question.photoUrl && (
        <PhotoZoom src={question.photoUrl} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.kind !== 'photo' && (
        <ActionSheet
          question={question}
          first={dialog}
          onClose={() => setDialog(null)}
          onQuestionDeleted={() => {
            setDialog(null);
            onGone();
          }}
        />
      )}
    </div>
  );
}

function PhotoZoom({ src, onClose }: { src: string; onClose: () => void }) {
  const titleId = useId();
  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      {(close) => (
        <>
          <span id={titleId} className="sr-only">Foto de la pregunta</span>
          <button type="button" className="sheet__zoom" aria-label="Cerrar la foto" onClick={close}>
            <img src={src} alt="Foto de la pregunta" />
          </button>
        </>
      )}
    </Sheet>
  );
}

/** ⋯ of the question or of an answer, and the steps it leads to, in one bottom sheet. */
function ActionSheet({
  question,
  first,
  onClose,
  onQuestionDeleted,
}: {
  question: Question;
  first: Exclude<Dialog, { kind: 'photo' }>;
  onClose: () => void;
  onQuestionDeleted: () => void;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requireAccount = useRequireAccount();
  const [step, setStep] = useState<Exclude<Dialog, { kind: 'photo' }>['kind']>(first.kind);
  const { target } = first;
  const isQuestion = target.type === 'question';
  const noun = isQuestion ? 'pregunta' : 'respuesta';

  useEffect(() => {
    if (step !== 'menu') headingRef.current?.focus();
  }, [step]);

  const [reason, setReason] = useState<ReportReason | 'hide' | null>(null);
  const report = useReport();
  const hide = useHideForMe();
  const removeQuestion = useRemoveQuestion();
  const removeAnswer = useRemoveAnswer();
  const kind = isQuestion ? 'question' : 'answer';
  const itemId = isQuestion ? question.id : target.answer.id;
  const mine = isQuestion ? question.isMine : target.answer.isMine;
  const canDelete = isQuestion ? question.isMine && question.answerCount === 0 : target.answer.isMine && !target.answer.helpful;
  const removing = removeQuestion.isPending || removeAnswer.isPending;
  const removeError = removeQuestion.error ?? removeAnswer.error;

  const title =
    step === 'menu' ? (isQuestion ? 'Más opciones' : 'Más opciones de la respuesta')
    : step === 'report' ? `Reportar la ${noun}`
    : step === 'delete' ? `¿Borrar tu ${noun}?`
    : step === 'reported' ? 'Gracias por avisar'
    : step === 'hidden' ? 'Listo, ya no la verás'
    : `${isQuestion ? 'Pregunta' : 'Respuesta'} borrada`;

  const doDelete = () => {
    if (isQuestion) removeQuestion.mutate(question.id, { onSuccess: () => setStep('deleted') });
    else removeAnswer.mutate({ id: target.answer.id, questionId: question.id }, { onSuccess: () => setStep('deleted') });
  };

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="sheet__bar-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
              <CloseIcon />
            </button>
          </header>

          {step === 'menu' && (
            <ul className="menu">
              {!mine && (
                <li>
                  <button
                    type="button"
                    className="menu__item"
                    onClick={() => requireAccount('Así nos avisas de algo que no debería estar.', () => setStep('report'))}
                  >
                    <FlagIcon size={20} /> Reportar
                  </button>
                </li>
              )}
              {canDelete && (
                <li>
                  <button type="button" className="menu__item menu__item--danger" onClick={() => setStep('delete')}>
                    <TrashIcon size={20} /> Borrar {noun}
                  </button>
                </li>
              )}
            </ul>
          )}

          {step === 'report' && (
            <form
              className="sheet__content report"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason === 'hide') hide.mutate({ kind, id: itemId }, { onSuccess: () => setStep('hidden') });
                else if (reason) report.mutate({ kind, id: itemId, reason }, { onSuccess: () => setStep('reported') });
              }}
            >
              <fieldset className="report__set">
                <legend className="report__legend">¿Qué pasa con esta {noun}?</legend>
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
              {(report.error ?? hide.error) && <p className="field__error" role="alert">{errorMessage(report.error ?? hide.error)}</p>}
              <button type="submit" className={reason ? 'btn btn--full' : 'btn btn--secondary btn--full'} disabled={!reason || report.isPending || hide.isPending}>
                {report.isPending || hide.isPending ? 'Enviando…' : reason === 'hide' ? 'Ocultar' : reason ? 'Enviar reporte' : 'Elige una opción'}
              </button>
            </form>
          )}

          {step === 'delete' && (
            <div className="sheet__content qd__confirm">
              <p className="empty__text">
                {isQuestion
                  ? 'Desaparece para todos. Si era urgente, las 5 yapitas no se devuelven.'
                  : 'Desaparece junto con su conversación.'}
              </p>
              {removeError && <p className="field__error" role="alert">{errorMessage(removeError)}</p>}
              <div className="confirm__actions">
                <button type="button" className="btn btn--secondary" onClick={() => setStep('menu')}>No, dejarla</button>
                <button type="button" className="btn btn--danger" disabled={removing} onClick={doDelete}>
                  {removing ? 'Borrando…' : 'Sí, borrar'}
                </button>
              </div>
            </div>
          )}

          {(step === 'reported' || step === 'hidden' || step === 'deleted') && (
            <div className="sheet__content qd__confirm" role="status">
              <p className="empty__text">
                {step === 'reported'
                  ? 'Ya no la verás. La revisamos y, si más vecinos la reportan, se oculta para todos.'
                  : step === 'hidden'
                    ? 'Desaparece de tus listas. Nadie más se entera.'
                    : 'Ya no aparece en ¿Alguien sabe?.'}
              </p>
              <button type="button" className="btn btn--secondary" onClick={step === 'deleted' && isQuestion ? onQuestionDeleted : close}>
                {step === 'deleted' && isQuestion ? 'Volver' : 'Listo'}
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
