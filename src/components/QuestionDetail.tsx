// A question and its answers (wiki › flujo-final › «2 · ¿Alguien sabe?», SPEC 10). One component, two homes:
// the page `/p/:id` on a phone and the side panel on desktop. It holds every action of the conversation:
// Guardar, Compartir, ⋯ (Reportar · Borrar), answering, rating and the thread under each answer (SPEC 12).
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  REPORT_REASONS,
  isDataError,
  useCloseQuestion,
  useHideForMe,
  useLiveQuestion,
  useMarkHelpful,
  useMarkNotHelpful,
  useQuestion,
  useRemoveAnswer,
  useRemoveComment,
  useRemoveQuestion,
  useReport,
  useToggleSaved,
  type Answer,
  type Author,
  type Comment,
  type Id,
  type Question,
  type ReportReason,
} from '../data';
import { useRequireAccount } from './AuthGate';
import { AnswerBox } from './AnswerBox';
import { AnswerThread } from './AnswerThread';
import { ContactPanel, RequestContactButton, canRequestContact } from './ContactRequest';
import { BookmarkIcon, CheckIcon, CloseIcon, FlagIcon, MoreIcon, ShareIcon, ThumbDownIcon, ThumbIcon, TrashIcon } from './icons';
import { errorMessage, firstName, rewardCapMessage } from './messages';
import { answersText, isUrgentActive } from './QuestionCard';
import { Sheet } from './Sheet';
import { timeAgo } from './time';
import { Toast } from './Toast';
import { Yapita } from './Yapita';
import type { NoticeFocus } from './notices';
import './sign-sheet.css';
import './question-detail.css';
import { FadeImage } from './FadeImage';

type Target = { type: 'question' } | { type: 'answer'; answer: Answer } | { type: 'comment'; comment: Comment };
type Dialog = { kind: 'menu' | 'report' | 'delete' | 'reported' | 'hidden' | 'deleted' | 'close' | 'closed'; target: Target } | { kind: 'photo' };

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
  // Live while the question is on screen (wiki #185); the 15 s refresh only runs while the channel is down
  const live = useLiveQuestion(id);
  const detail = useQuestion(id, { live });
  const requireAccount = useRequireAccount();
  const toggleSaved = useToggleSaved();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [sent, setSent] = useState(false);
  const [shareDismissed, setShareDismissed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as { shareFor?: Id; chargeFailed?: boolean; focus?: NoticeFocus } | null;
  const shareFor = navState?.shareFor;
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [saveFailed, setSaveFailed] = useState<{ id: number; message: string } | null>(null);
  const saving = useRef(false);
  const markHelpful = useMarkHelpful();
  const heading = useRef<HTMLHeadingElement>(null);
  const Heading = variant === 'page' ? 'h1' : 'h2';

  // Opened from Avisos (SPEC 24, wiki #216): scroll to the answer or comment the notice is about and frame it for a
  // moment. It is found by its text (the notice carries the full text). The request leaves history, so Back or a
  // reload do not replay it; if nothing matches (deleted, edited), the question just opens at its top.
  const focus = navState?.focus;
  const answersData = detail.data?.answers;
  const [spot, setSpot] = useState<{ kind: 'answer' | 'comment'; id: Id } | null>(null);
  const focusHandled = useRef<string | null>(null);
  const focusRetry = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(focusRetry.current), []);
  useEffect(() => {
    if (!focus || !answersData) return;
    const handledKey = `${id}|${focus.kind}|${focus.text}`;
    if (focusHandled.current === handledKey) return;
    focusHandled.current = handledKey;
    let target: { kind: 'answer' | 'comment'; id: Id } | null = null;
    if (focus.kind === 'answer') {
      const found = answersData.find((a) => a.text === focus.text);
      if (found) target = { kind: 'answer', id: found.id };
    } else {
      for (const a of answersData) {
        const found = a.comments.find((c) => c.text === focus.text);
        if (found) {
          target = { kind: 'comment', id: found.id };
          break;
        }
      }
    }
    const { focus: _done, ...rest } = navState ?? {};
    navigate(location.pathname + location.search, { replace: true, state: Object.keys(rest).length > 0 ? rest : null, preventScrollReset: true });
    if (!target) return;
    const goal = target;
    setSpot(goal);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bringIntoView = () => {
      const el = document.getElementById(`${variant}-${goal.kind}-${goal.id}`);
      if (!el) return;
      const box = el.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight) return; // already in view
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    };
    // Once a hidden comment has unfolded, and again after the screen change: its scroll restoration lands the new
    // page at the top a moment later, which would undo the first try
    requestAnimationFrame(() => requestAnimationFrame(bringIntoView));
    // Not tied to this effect's cleanup: dropping `focus` from history re-runs it right away
    focusRetry.current = window.setTimeout(bringIntoView, 450);
  }, [focus, answersData, id, variant, navState, navigate, location.pathname, location.search]);
  useEffect(() => {
    if (spot === null) return;
    const done = window.setTimeout(() => setSpot(null), 2800);
    return () => window.clearTimeout(done);
  }, [spot]);

  // A conversation opened from the panel takes the focus on its text
  useEffect(() => {
    if (variant === 'panel' && detail.data) heading.current?.focus({ preventScroll: true });
  }, [variant, id, detail.isSuccess]);

  // The question stays on screen while a dialog about it is open, even if a refresh already says it is gone
  // (reporting or deleting it makes it «not found» for the person): TanStack keeps the last data on an error
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

  if (!detail.data) {
    const gone = isDataError(detail.error) && detail.error.code === 'not_found';
    return (
      <div className="qd">
        <div className="empty" role="alert">
          <Heading ref={heading} tabIndex={-1} className="empty__title">{gone ? 'Esto ya no está disponible' : errorMessage(detail.error)}</Heading>
          {gone ? (
            variant === 'page' ? (
              <Link className="btn" to="/" replace>Ir a Hoy</Link>
            ) : (
              // Desktop panel (#218): it leaves the list and the panel goes back to empty, like after deleting it
              <button type="button" className="btn btn--secondary" onClick={onGone}>Volver a la lista</button>
            )
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => detail.refetch()}>Reintentar</button>
          )}
        </div>
      </div>
    );
  }

  const { question, answers } = detail.data;
  const urgent = question.status === 'open' && isUrgentActive(question);

  // ☆ Guardar: one at a time, so a double tap never saves and unsaves; a failure says why (a toast)
  const toggle = (kind: 'question' | 'answer', itemId: Id) => {
    if (saving.current) return;
    saving.current = true;
    toggleSaved.mutate(
      { kind, id: itemId },
      {
        onError: (error) => setSaveFailed({ id: Date.now(), message: errorMessage(error) }),
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const savingQuestion = toggleSaved.isPending && toggleSaved.variables?.kind === 'question';
  const savingAnswer = (answer: Answer) => toggleSaved.isPending && toggleSaved.variables?.kind === 'answer' && toggleSaved.variables.id === answer.id;

  const saveQuestion = () =>
    requireAccount(
      'Así guardas esta pregunta para verla después.',
      () => toggle('question', question.id),
      undefined,
      { kind: 'save-question', id: question.id },
    );
  const saveAnswer = (answer: Answer) =>
    requireAccount(
      'Así guardas esta respuesta para verla después.',
      () => toggle('answer', answer.id),
      undefined,
      { kind: 'save-answer', id: answer.id },
    );

  // Not mine, still Abierta and I have not answered yet (a guest sees the box and meets the wall at «Enviar»)
  const canAnswer = !question.isMine && question.status === 'open' && !answers.some((a) => a.isMine);
  const sendHelpful = (answer: Answer) => {
    const firstOne = question.status === 'open';
    const name = firstName(answer.author.displayName);
    setNotice(null);
    markHelpful.mutate(answer.id, {
      // The server says whether it paid: the first 3 of a question, 3 a day to the same person (wiki #188-189)
      onSuccess: ({ rewardCap }) =>
        setNotice({
          title: '¡Gracias, pues!',
          text:
            (rewardCapMessage(rewardCap, name) ?? `${name} recibe +5 yapitas por ayudarte.`) +
            (firstOne ? ' Tu pregunta quedó Solucionada y ganas +1 yapita.' : ''),
        }),
    });
  };
  const canClose = question.isMine && question.status === 'open' && answers.length > 0;
  const canDeleteQuestion = question.isMine && question.answerCount === 0;
  const hasQuestionMenu = !question.isMine || canDeleteQuestion;
  const openMenu = (target: Target) => setDialog({ kind: 'menu', target });

  return (
    <div className="qd">
      {saveFailed && <Toast key={saveFailed.id} message={saveFailed.message} onDone={() => setSaveFailed(null)} />}
      {shareFor === question.id && question.isMine && navState?.chargeFailed && (
        <p className="notice" role="status">No pudimos cobrar, se publicó normal</p>
      )}
      {shareFor === question.id && question.isMine && !shareDismissed && (
        <section className="qd__share" aria-labelledby={`${variant}-share`}>
          <div>
            <h3 id={`${variant}-share`} className="qd__share-title">Pregúntale a tus grupos</h3>
            <p className="meta">Comparte tu pregunta en WhatsApp y recibe respuestas más rápido.</p>
          </div>
          <a className="btn btn--small" href={whatsappHref(question)} target="_blank" rel="noreferrer" onClick={() => setShareDismissed(true)}>
            <ShareIcon size={18} /> Compartir por WhatsApp
          </a>
          <button type="button" className="icon-btn qd__share-close" aria-label="Cerrar" onClick={() => setShareDismissed(true)}>
            <CloseIcon size={18} />
          </button>
        </section>
      )}
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
            <FadeImage key={question.photoUrl} src={question.photoUrl} alt="Foto de la pregunta" />
          </button>
        )}
        <div className="qd__actions">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            aria-pressed={question.savedByMe}
            aria-busy={savingQuestion || undefined}
            disabled={savingQuestion}
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
        {notice && (
          <p className="sheet__message sheet__thanks qd__notice" role="status">
            <Yapita size="lg" />
            <span>
              <strong>{notice.title}</strong>
              <span>{notice.text}</span>
            </span>
          </p>
        )}
        {markHelpful.error && <p className="field__error" role="alert">{errorMessage(markHelpful.error)}</p>}
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
                <li
                  key={answer.id}
                  id={`${variant}-answer-${answer.id}`}
                  className="answer"
                  data-helpful={answer.helpful || undefined}
                  data-spotlight={(spot?.kind === 'answer' && spot.id === answer.id) || undefined}
                >
                  {/* Guardar and ⋯ sit by the author, so the row under the text keeps only the actions on it */}
                  <div className="answer__head">
                    <AuthorLine author={answer.author} mine={answer.isMine} when={timeAgo(answer.createdAt)} prefix="Lo respondiste " />
                    <div className="answer__tools">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={answer.savedByMe ? 'Quitar la respuesta de guardados' : 'Guardar la respuesta'}
                        aria-pressed={answer.savedByMe}
                        aria-busy={savingAnswer(answer) || undefined}
                        disabled={savingAnswer(answer)}
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
                  </div>
                  <p className="answer__text">{answer.text}</p>
                  {answer.helpful && (
                    <p className="answer__marked">
                      <CheckIcon size={16} /> {question.isMine ? 'Te sirvió' : 'Le sirvió a quien preguntó'}
                    </p>
                  )}
                  {question.isMine && answer.notHelpful && (
                    <p className="answer__marked answer__marked--no">
                      <ThumbDownIcon size={16} /> No te sirvió
                    </p>
                  )}
                  {((question.isMine && !answer.helpful) || canRequestContact(question, answer)) && (
                    <div className="answer__actions">
                      {question.isMine && !answer.helpful && (
                        <button
                          type="button"
                          className="btn btn--small answer__helpful"
                          // Only the one being sent changes; the others keep their look and just ignore the tap
                          disabled={markHelpful.isPending && markHelpful.variables === answer.id}
                          aria-disabled={markHelpful.isPending || undefined}
                          onClick={() => !markHelpful.isPending && sendHelpful(answer)}
                        >
                          {markHelpful.isPending && markHelpful.variables === answer.id ? (
                            <>
                              <span className="upload__spinner" aria-hidden="true" /> Enviando…
                            </>
                          ) : (
                            <>
                              <ThumbIcon size={18} /> Me sirvió
                            </>
                          )}
                        </button>
                      )}
                      {canRequestContact(question, answer) && <RequestContactButton question={question} answer={answer} />}
                    </div>
                  )}
                  <ContactPanel question={question} answer={answer} />
                  <AnswerThread
                    questionId={question.id}
                    answer={answer}
                    onMenu={(comment) => openMenu({ type: 'comment', comment })}
                    idPrefix={variant}
                    spotlightId={spot?.kind === 'comment' ? spot.id : null}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canClose && (
        <button type="button" className="btn btn--secondary" onClick={() => setDialog({ kind: 'close', target: { type: 'question' } })}>
          Ninguna me sirvió
        </button>
      )}
      {canAnswer && <AnswerBox questionId={question.id} onSent={() => setSent(true)} />}
      <p className="sr-only" role="status">{sent ? 'Tu respuesta se envió' : ''}</p>

      {dialog?.kind === 'photo' && question.photoUrl && (
        <PhotoZoom src={question.photoUrl} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.kind !== 'photo' && (
        <ActionSheet
          question={question}
          first={dialog}
          onClose={() => setDialog(null)}
          onQuestionGone={() => {
            // The sheet must be gone before going back: while it is open a history pop only closes it
            flushSync(() => setDialog(null));
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
            <FadeImage key={src} src={src} alt="Foto de la pregunta" />
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
  onQuestionGone,
}: {
  question: Question;
  first: Exclude<Dialog, { kind: 'photo' }>;
  onClose: () => void;
  /** The question was deleted or reported: leave it, from the button or from the ✕ alike. */
  onQuestionGone: () => void;
}) {
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requireAccount = useRequireAccount();
  type Step = Exclude<Dialog, { kind: 'photo' }>['kind'];
  const [step, setCurrentStep] = useState<Step>(first.kind);
  // The first step arrives with the sheet; every later one slides in over the same sheet
  const [moved, setMoved] = useState(false);
  const setStep = (next: Step) => {
    setMoved(true);
    setCurrentStep(next);
  };
  const { target } = first;
  const isQuestion = target.type === 'question';
  const isComment = target.type === 'comment';
  const noun = isQuestion ? 'pregunta' : isComment ? 'comentario' : 'respuesta';
  // «el comentario» is masculine; «la pregunta», «la respuesta» feminine
  const the = isComment ? 'el' : 'la';
  const it = isComment ? 'lo' : 'la';
  const this_ = isComment ? 'este' : 'esta';

  useEffect(() => {
    if (step !== 'menu') headingRef.current?.focus();
  }, [step]);

  const [reason, setReason] = useState<ReportReason | 'hide' | null>(null);
  const report = useReport();
  const hide = useHideForMe();
  const removeQuestion = useRemoveQuestion();
  const removeAnswer = useRemoveAnswer();
  const removeComment = useRemoveComment();
  const closeQuestion = useCloseQuestion();
  const markNotHelpful = useMarkNotHelpful();
  const kind = target.type;
  const itemId = target.type === 'question' ? question.id : target.type === 'answer' ? target.answer.id : target.comment.id;
  const mine = target.type === 'question' ? question.isMine : target.type === 'answer' ? target.answer.isMine : target.comment.isMine;
  const canDelete =
    target.type === 'question' ? question.isMine && question.answerCount === 0
    : target.type === 'answer' ? target.answer.isMine && !target.answer.helpful
    : target.comment.isMine;
  const removing = removeQuestion.isPending || removeAnswer.isPending || removeComment.isPending;
  const removeError = removeQuestion.error ?? removeAnswer.error ?? removeComment.error;

  const title =
    step === 'menu' ? (isQuestion ? 'Más opciones' : `Más opciones ${isComment ? 'del' : 'de la'} ${noun}`)
    : step === 'report' ? `Reportar ${the} ${noun}`
    : step === 'delete' ? `¿Borrar tu ${noun}?`
    : step === 'close' ? '¿Cerrar sin solución?'
    : step === 'closed' ? 'Pregunta cerrada'
    : step === 'reported' ? 'Gracias por avisar'
    : step === 'hidden' ? `Listo, ya no ${it} verás`
    : isComment ? 'Comentario borrado' : `${isQuestion ? 'Pregunta' : 'Respuesta'} borrada`;

  const doDelete = () => {
    if (target.type === 'question') removeQuestion.mutate(question.id, { onSuccess: () => setStep('deleted') });
    else if (target.type === 'answer') removeAnswer.mutate({ id: target.answer.id, questionId: question.id }, { onSuccess: () => setStep('deleted') });
    // A deleted comment just leaves the thread: no «borrado» step, the sheet closes
    else removeComment.mutate({ id: target.comment.id, questionId: question.id }, { onSuccess: onClose });
  };

  return (
    <Sheet labelledBy={titleId} variant="bottom" onClose={isQuestion && (step === 'deleted' || step === 'reported' || step === 'hidden') ? onQuestionGone : onClose}>
      {(close) => (
        <>
          <header className="sheet__bar">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="sheet__bar-title">{title}</h2>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}>
              <CloseIcon />
            </button>
          </header>

          <div key={step} className={moved ? 'qd__step qd__step--in' : 'qd__step'}>
            {step === 'menu' && (
              <ul className="menu">
                {target.type === 'answer' && question.isMine && !target.answer.helpful && !target.answer.notHelpful && (
                  <li>
                    <button
                      type="button"
                      className="menu__item"
                      disabled={markNotHelpful.isPending}
                      aria-busy={markNotHelpful.isPending || undefined}
                      onClick={() => markNotHelpful.mutate(target.answer.id, { onSuccess: close })}
                    >
                      <ThumbDownIcon size={20} /> {markNotHelpful.isPending ? 'Enviando…' : 'No me sirvió'}
                    </button>
                    {markNotHelpful.error && <p className="field__error menu__error" role="alert">{errorMessage(markNotHelpful.error)}</p>}
                  </li>
                )}
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
                  <legend className="report__legend">¿Qué pasa con {this_} {noun}?</legend>
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
                    : isComment
                      ? 'Desaparece para todos.'
                      : 'Desaparece junto con su conversación.'}
                </p>
                {removeError && <p className="field__error" role="alert">{errorMessage(removeError)}</p>}
                <div className="confirm__actions">
                  <button type="button" className="btn btn--secondary" onClick={() => setStep('menu')}>{isComment ? 'Cancelar' : 'No, dejarla'}</button>
                  <button type="button" className="btn btn--danger" disabled={removing} onClick={doDelete}>
                    {removing ? 'Borrando…' : isComment ? 'Borrar' : 'Sí, borrar'}
                  </button>
                </div>
              </div>
            )}

            {step === 'close' && (
              <div className="sheet__content qd__confirm">
                <p className="empty__text">Si ninguna respuesta te sirvió, tu pregunta queda Cerrada y ganas 1 yapita.</p>
                {closeQuestion.error && <p className="field__error" role="alert">{errorMessage(closeQuestion.error)}</p>}
                <div className="confirm__actions">
                  <button type="button" className="btn btn--secondary" onClick={close}>Seguir esperando</button>
                  <button type="button" className="btn" disabled={closeQuestion.isPending} onClick={() => closeQuestion.mutate(question.id, { onSuccess: () => setStep('closed') })}>
                    {closeQuestion.isPending ? 'Cerrando…' : 'Sí, cerrar'}
                  </button>
                </div>
              </div>
            )}

            {step === 'closed' && (
              <div className="sheet__content qd__confirm" role="status">
                <p className="empty__text">Tu pregunta quedó Cerrada y ganaste +1 yapita. Si luego una respuesta te sirve, aún puedes marcarla.</p>
                <button type="button" className="btn btn--secondary" onClick={close}>Listo</button>
              </div>
            )}

            {(step === 'reported' || step === 'hidden' || step === 'deleted') && (
              <div className="sheet__content qd__confirm" role="status">
                {step === 'deleted' && (
                  <span className="qd__done" aria-hidden="true">
                    <CheckIcon size={28} />
                  </span>
                )}
                <p className="empty__text">
                  {step === 'reported'
                    ? `Ya no ${it} verás. ${isComment ? 'Lo' : 'La'} revisamos y, si más vecinos ${it} reportan, se oculta para todos.`
                    : step === 'hidden'
                      ? 'Desaparece de tus listas. Nadie más se entera.'
                      : 'Ya no aparece en ¿Alguien sabe?.'}
                </p>
                <button type="button" className="btn btn--secondary" onClick={close}>
                  {isQuestion ? 'Volver' : 'Listo'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
