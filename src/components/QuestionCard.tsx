// Question card for the ¿Alguien sabe? list (wiki #2): text in 3 lines, thumbnail, zone · time, «Urgente»
// while it is active, the answer count and the status. The whole card opens the detail.
import type { Question } from '../data';
import { CheckIcon } from './icons';
import { useChangeTick } from './motion';
import { timeAgo } from './time';
import './question-card.css';
import { FadeImage } from './FadeImage';

export const isUrgentActive = (question: Pick<Question, 'urgentUntil'>, now = Date.now()) =>
  question.urgentUntil !== null && Date.parse(question.urgentUntil) > now;

export const answersText = (count: number) => (count === 0 ? 'Sin respuestas' : count === 1 ? '1 respuesta' : `${count} respuestas`);

type QuestionCardProps = {
  question: Question;
  selected?: boolean;
  /** Just opened from Avisos (SPEC 24): a fuchsia frame that pulses, then fades. */
  spotlight?: boolean;
  onOpen: (question: Question) => void;
};

export function QuestionCard({ question, selected, spotlight, onOpen }: QuestionCardProps) {
  const urgent = question.status === 'open' && isUrgentActive(question);
  const when = timeAgo(question.createdAt);
  const status = question.status === 'solved' ? 'Solucionada' : question.status === 'closed' ? 'Cerrada' : null;
  // A status that changes while the card is on screen fades in (SPEC 28, B4)
  const statusChange = useChangeTick(question.status);
  const statusClass = statusChange.tick > 0 ? ' tag-in' : '';
  const label = [urgent ? 'Urgente' : null, question.text, question.zone, when, answersText(question.answerCount), status]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="qcard" data-selected={selected || undefined} data-spotlight={spotlight || undefined}>
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
          {urgent && <UrgentTag />}
          {status === 'Solucionada' && (
            <span key={statusChange.tick} className={`tag tag--ok${statusClass}`}>
              <CheckIcon size={14} /> Solucionada
            </span>
          )}
          {status === 'Cerrada' && <span key={statusChange.tick} className={`tag tag--muted${statusClass}`}>Cerrada</span>}
          <span className="qcard__count">{answersText(question.answerCount)}</span>
        </p>
      </div>
      {question.photoUrl && (
        <div className="qcard__media">
          <FadeImage key={question.photoUrl} src={question.photoUrl} alt="" loading="lazy" decoding="async" />
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

/** «Urgente» while the urgency is active: a small coral dot breathes in it, opacity only (SPEC 28, B5). */
export function UrgentTag() {
  return (
    <span className="tag tag--urgent">
      <span className="tag__dot" aria-hidden="true" />
      Urgente
    </span>
  );
}
