// The public thread under an answer (wiki › flujo-final › «Detalle», #184): the 2 most recent comments, «Ver los N
// comentarios» for the rest, and «Comentar» (up to 500 characters). The account wall comes at «Enviar», so what is
// typed is kept as a draft that survives the Google redirect (SPEC 07, draftStore), as «Tu respuesta» does.
import { useEffect, useId, useRef, useState } from 'react';
import { useCreateComment, type Answer, type Comment, type Id } from '../data';
import { useDraftSaver, useRequireAccount } from './AuthGate';
import { clearDraft, loadDraft } from './draftStore';
import { CommentIcon, MoreIcon } from './icons';
import { errorMessage, limitMessage } from './messages';
import { timeAgo } from './time';
import './answer-thread.css';

const MAX = 500;
const SHOWN = 2;

const draftKey = (answerId: Id) => `comment:${answerId}`;
const DRAFT_SENT = 'bs:comment-draft-sent';

/** Back from Google with a comment in hand: send it once. Never throws; on failure the draft stays in the box. */
export async function sendDraftComment(
  answerId: Id,
  questionId: Id,
  send: (input: { answerId: Id; questionId: Id; text: string }) => Promise<unknown>,
): Promise<void> {
  const saved = (await loadDraft(draftKey(answerId)))?.fields.text;
  const text = typeof saved === 'string' ? saved.trim() : '';
  if (!text) return;
  try {
    await send({ answerId, questionId, text });
    await clearDraft(draftKey(answerId));
    // The thread may already show this draft in its box: tell it the comment went out
    window.dispatchEvent(new CustomEvent(DRAFT_SENT, { detail: draftKey(answerId) }));
  } catch {
    /* the draft stays: the person sees it in the box and taps «Enviar» */
  }
}

type AnswerThreadProps = {
  questionId: Id;
  answer: Answer;
  /** ⋯ of a comment: Reportar (others') or Borrar (mine). */
  onMenu: (comment: Comment) => void;
};

export function AnswerThread({ questionId, answer, onMenu }: AnswerThreadProps) {
  const fieldId = useId();
  const key = draftKey(answer.id);
  const requireAccount = useRequireAccount();
  const create = useCreateComment();
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const edited = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();

  // A draft saved before Google opens the box with it, unless the person already started typing again
  useEffect(() => {
    let cancelled = false;
    void loadDraft(key).then((draft) => {
      const saved = draft?.fields.text;
      if (cancelled || edited.current || typeof saved !== 'string' || !saved.trim()) return;
      setText(saved);
      setComposing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Sent from the saved draft after Google: empty the box, unless the person already typed something new
  useEffect(() => {
    const onSent = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== key || edited.current) return;
      setText('');
      setComposing(false);
    };
    window.addEventListener(DRAFT_SENT, onSent);
    return () => window.removeEventListener(DRAFT_SENT, onSent);
  }, [key]);

  useDraftSaver(() => (trimmed ? { key, draft: { fields: { text }, blobs: {} } } : null));

  const comments = answer.comments;
  const hiddenCount = expanded ? 0 : Math.max(0, comments.length - SHOWN);
  const shown = expanded ? comments : comments.slice(-SHOWN);

  const open = () => {
    setComposing(true);
    requestAnimationFrame(() => field.current?.focus());
  };
  const cancel = () => {
    setComposing(false);
    setText('');
    create.reset();
    void clearDraft(key);
  };
  const send = () =>
    create.mutate(
      { answerId: answer.id, questionId, text: trimmed },
      {
        onSuccess: () => {
          void clearDraft(key);
          setText('');
          setComposing(false);
        },
      },
    );

  return (
    <div className="thread">
      {comments.length > SHOWN && (
        <button type="button" className="link-btn thread__toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Ocultar comentarios' : hiddenCount === 1 ? 'Ver 1 comentario más' : `Ver los ${comments.length} comentarios`}
        </button>
      )}
      {shown.length > 0 && (
        <ul className="thread__list" aria-label="Comentarios">
          {shown.map((comment) => (
            <li key={comment.id} className="comment">
              <div className="comment__body">
                <p className="comment__meta">
                  <span className="comment__name">{comment.isMine ? 'Tú' : comment.author.displayName}</span>
                  <span>· {timeAgo(comment.createdAt)}</span>
                  {comment.inReview && <span className="tag tag--muted comment__review">En revisión</span>}
                </p>
                <p className="comment__text">{comment.text}</p>
              </div>
              <button
                type="button"
                className="icon-btn comment__more"
                aria-label={comment.isMine ? 'Opciones de tu comentario' : `Opciones del comentario de ${comment.author.displayName}`}
                aria-haspopup="dialog"
                onClick={() => onMenu(comment)}
              >
                <MoreIcon size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {composing ? (
        <form
          className="thread__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!trimmed || create.isPending) return;
            requireAccount('Así conversas con tus vecinos.', send, undefined, { kind: 'send-comment', answerId: answer.id, questionId });
          }}
        >
          <div className="upload__label-row">
            <label htmlFor={`${fieldId}-text`} className="sr-only">Tu comentario</label>
            <span className="meta thread__count" aria-hidden="true">{text.length}/{MAX}</span>
          </div>
          <textarea
            ref={field}
            id={`${fieldId}-text`}
            className="input input--box thread__text"
            rows={2}
            maxLength={MAX}
            placeholder="Escribe un comentario"
            value={text}
            onChange={(e) => {
              edited.current = true;
              setText(e.target.value);
            }}
          />
          {create.error && <p className="field__error" role="alert">{limitMessage(create.error) ?? errorMessage(create.error)}</p>}
          <div className="thread__buttons">
            <button type="button" className="btn btn--secondary btn--small" onClick={cancel}>Cancelar</button>
            <button type="submit" className="btn btn--small" disabled={!trimmed || create.isPending}>
              {create.isPending ? 'Enviando…' : create.error && !limitMessage(create.error) ? 'Reintentar' : 'Enviar'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="link-btn thread__comment" onClick={open}>
          <CommentIcon size={18} /> Comentar
        </button>
      )}
    </div>
  );
}
