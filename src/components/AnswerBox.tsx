// «Tu respuesta» (wiki › flujo-final › 2): up to 1000 characters under the answers. The account wall comes at
// «Enviar», so what is typed is kept as a draft that survives the Google redirect (SPEC 07, draftStore).
import { useEffect, useId, useRef, useState } from 'react';
import { isDataError, useCreateAnswer, type Id } from '../data';
import { useDraftSaver, useRequireAccount } from './AuthGate';
import { clearDraft, loadDraft } from './draftStore';
import { errorMessage } from './messages';

const MAX = 1000;

/**
 * Back from Google with an answer in hand: it was saved as a draft before the redirect, so send it once, as if the
 * person had just tapped «Enviar». Never throws: if it fails, the draft stays and the box shows it again.
 */
export async function sendDraftAnswer(questionId: Id, send: (input: { questionId: Id; text: string }) => Promise<unknown>): Promise<void> {
  const key = `answer:${questionId}`;
  const saved = (await loadDraft(key))?.fields.text;
  const text = typeof saved === 'string' ? saved.trim() : '';
  if (!text) return;
  try {
    await send({ questionId, text });
    await clearDraft(key);
  } catch {
    /* the draft stays: the person sees it in the box and taps «Enviar» */
  }
}

export function AnswerBox({ questionId, onSent }: { questionId: Id; onSent: () => void }) {
  const fieldId = useId();
  const key = `answer:${questionId}`;
  const requireAccount = useRequireAccount();
  const create = useCreateAnswer();
  const [text, setText] = useState('');
  const edited = useRef(false);
  const trimmed = text.trim();

  // A draft saved before Google, unless the person already started typing again
  useEffect(() => {
    let cancelled = false;
    void loadDraft(key).then((draft) => {
      const saved = draft?.fields.text;
      if (!cancelled && !edited.current && typeof saved === 'string') setText(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useDraftSaver(() => (trimmed ? { key, draft: { fields: { text }, blobs: {} } } : null));

  const send = () =>
    create.mutate(
      { questionId, text: trimmed },
      {
        onSuccess: () => {
          void clearDraft(key);
          setText('');
          onSent();
        },
      },
    );

  const error = create.error;
  const message = isDataError(error) && error.code === 'forbidden' ? 'Esta pregunta ya no recibe respuestas' : error ? errorMessage(error) : null;

  return (
    <form
      className="answerbox"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed || create.isPending) return;
        requireAccount('Así quien preguntó recibe tu respuesta.', send, undefined, { kind: 'send-answer', questionId });
      }}
    >
      <div className="upload__label-row">
        <label htmlFor={`${fieldId}-text`} className="answerbox__label">Tu respuesta</label>
        <span className="meta" aria-hidden="true">{text.length}/{MAX}</span>
      </div>
      <textarea
        id={`${fieldId}-text`}
        className="input input--box answerbox__text"
        rows={3}
        maxLength={MAX}
        placeholder="Escribe tu respuesta"
        value={text}
        onChange={(e) => {
          edited.current = true;
          setText(e.target.value);
        }}
      />
      {message && <p className="field__error" role="alert">{message}</p>}
      <button type="submit" className="btn" disabled={!trimmed || create.isPending}>
        {create.isPending ? 'Enviando…' : error ? 'Reintentar' : 'Enviar'}
      </button>
    </form>
  );
}
