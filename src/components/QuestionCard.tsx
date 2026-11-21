// Question card for the ¿Alguien sabe? list (wiki #2): text in 3 lines, thumbnail, zone · time, «Urgente»
// while it is active, the answer count and the status. The whole card opens the detail.
import type { Question } from '../data';
import { CheckIcon } from './icons';
import { timeAgo } from './time';
import './question-card.css';

export const isUrgentActive = (question: Pick<Question, 'urgentUntil'>, now = Date.now()) =>
  question.urgentUntil !== null && Date.parse(question.urgentUntil) > now;

export const answersText = (count: number) => (count === 0 ? 'Sin respuestas' : count === 1 ? '1 respuesta' : `${count} respuestas`);

type QuestionCardProps = {
  question: Question;
  selected?: boolean;
  onOpen: (question: Question) => void;
};

export function QuestionCard({ question, selected, onOpen }: QuestionCardProps) {
  const urgent = question.status === 'open' && isUrgentActive(question);
  const when = timeAgo(question.createdAt);
  const status = question.status === 'solved' ? 'Solucionada' : question.status === 'closed' ? 'Cerrada' : null;
  const label = [urgent ? 'Urgente' : null, question.text, question.zone, when, answersText(question.answerCount), status]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="qcard" data-selected={selected || undefined}>
      <div className="qcard__main">
        <h3 className="qcard__text">
          {/* Stretched button: the whole card is one tap target and works by keyboard */}
          <button type="button" className="qcard__open" aria-label={label} aria-current={selected || undefined} onClick={() => onOpen(question)}>
            {question.text}
          </button>
        </h3>
        <p className="qcard__meta" aria-hidden="true">
          {question.zone} · {when}
        </p>
        <p className="qcard__tags" aria-hidden="true">
          {urgent && <span className="tag tag--urgent">Urgente</span>}
          {status === 'Solucionada' && (
            <span className="tag tag--ok">
              <CheckIcon size={14} /> Solucionada
            </span>
          )}
          {status === 'Cerrada' && <span className="tag tag--muted">Cerrada</span>}
          <span className="qcard__count">{answersText(question.answerCount)}</span>
        </p>
      </div>
      {question.photoUrl && (
        <div className="qcard__media">
          <img src={question.photoUrl} alt="" loading="lazy" decoding="async" />
        </div>
      )}
    </article>
  );
}

export function QuestionCardSkeleton() {
  return (
    <div className="qcard" aria-hidden="true">
      <div className="qcard__main">
        <div className="skeleton" style={{ height: '1rem', width: '90%' }} />
        <div className="skeleton" style={{ height: '1rem', marginTop: 'var(--s-2)', width: '60%' }} />
        <div className="skeleton" style={{ height: '0.875rem', marginTop: 'var(--s-3)', width: '40%' }} />
      </div>
    </div>
  );
}
