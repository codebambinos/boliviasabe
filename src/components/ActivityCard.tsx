// Yo › «Mi actividad» (wiki › 3 · Yo, #92, #213): four tabs, Mis preguntas · Mis respuestas · Mis letreros ·
// Guardados. A row opens its detail (an answer opens its question; a letrero opens its sheet over Yo). Content hidden by reports shows «En revisión»
// to its author. Each tab has its skeleton, its error with Reintentar and its empty text with the button to do it.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMyAnswers, useMyQuestions, useMySigns, useSaved, type Answer, type Question, type Sign } from '../data';
import { FadeImage } from './FadeImage';
import { ChevronRightIcon } from './icons';
import { timeAgo } from './time';
import { goWithTransition } from './transition';
import { useShell } from './useShell';

type Tab = 'questions' | 'answers' | 'signs' | 'saved';

const TABS: { id: Tab; label: string }[] = [
  { id: 'questions', label: 'Mis preguntas' },
  { id: 'answers', label: 'Mis respuestas' },
  { id: 'signs', label: 'Mis letreros' },
  { id: 'saved', label: 'Guardados' },
];

type ActivityCardProps = {
  onAsk: () => void;
  onUpload: () => void;
};

export function ActivityCard({ onAsk, onUpload }: ActivityCardProps) {
  const [tab, setTab] = useState<Tab>('questions');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const navigate = useNavigate();
  const { openSign } = useShell();
  const index = TABS.findIndex((t) => t.id === tab);

  const go = (path: string) => goWithTransition((viewTransition) => navigate(path, { viewTransition }), 'forward');
  const openQuestion = (id: number) => go(`/p/${id}`);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); the focus follows the selection
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const jump = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
    if (!step && jump === null) return;
    event.preventDefault();
    const next = jump ?? (index + step + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="card activity yo-grid__activity" aria-labelledby="actividad-title">
      <h2 id="actividad-title" className="card__title">Mi actividad</h2>
      <div
        className="activity__tabs"
        role="tablist"
        aria-label="Mi actividad"
        onKeyDown={onKeyDown}
        style={{ ['--c4' as string]: index, ['--c2' as string]: index % 2, ['--r2' as string]: Math.floor(index / 2) }}
      >
        <span className="activity__pill" aria-hidden="true" />
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`actividad-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="actividad-panel"
            tabIndex={t.id === tab ? 0 : -1}
            className="activity__tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* key: the list cross-fades and rises a little on every tab change */}
      <div key={tab} id="actividad-panel" role="tabpanel" aria-labelledby={`actividad-tab-${tab}`} className="activity__panel yo-panel-in">
        {tab === 'questions' && <MyQuestions onOpen={openQuestion} onAsk={onAsk} />}
        {tab === 'answers' && <MyAnswers onOpen={openQuestion} onBrowse={() => go('/preguntas')} />}
        {tab === 'signs' && <MySigns onOpen={openSign} onUpload={onUpload} />}
        {tab === 'saved' && <Saved onOpenQuestion={openQuestion} onOpenSign={openSign} onBrowse={() => go('/')} />}
      </div>
    </section>
  );
}

// ---------- tabs ----------

function MyQuestions({ onOpen, onAsk }: { onOpen: (id: number) => void; onAsk: () => void }) {
  const query = useMyQuestions();
  return (
    <ListState query={query} empty={<Empty text="Aún no tienes preguntas." action="Preguntar" onAction={onAsk} />}>
      {(items) => (
        <ul className="rows rows--links">
          {items.map((q) => <QuestionRow key={q.id} question={q} onOpen={onOpen} />)}
        </ul>
      )}
    </ListState>
  );
}

function MyAnswers({ onOpen, onBrowse }: { onOpen: (id: number) => void; onBrowse: () => void }) {
  const query = useMyAnswers();
  return (
    <ListState query={query} empty={<Empty text="Aún no tienes respuestas." action="Ir a ¿Alguien sabe?" onAction={onBrowse} />}>
      {(items) => (
        <ul className="rows rows--links">
          {items.map((a) => <AnswerRow key={a.id} answer={a} onOpen={onOpen} />)}
        </ul>
      )}
    </ListState>
  );
}

function MySigns({ onOpen, onUpload }: { onOpen: (sign: Sign) => void; onUpload: () => void }) {
  const query = useMySigns();
  return (
    <ListState query={query} empty={<Empty text="Aún no tienes letreros." action="Subir letrero" onAction={onUpload} />}>
      {(items) => (
        <ul className="rows rows--links">
          {items.map((s) => <SignRow key={s.id} sign={s} onOpen={onOpen} />)}
        </ul>
      )}
    </ListState>
  );
}

function Saved({ onOpenQuestion, onOpenSign, onBrowse }: { onOpenQuestion: (id: number) => void; onOpenSign: (sign: Sign) => void; onBrowse: () => void }) {
  const query = useSaved();
  const empty = <Empty text="Aún no tienes nada guardado." action="Ir a Hoy" onAction={onBrowse} />;
  return (
    <ListState query={query} empty={empty} isEmpty={(d) => d.signs.length + d.questions.length + d.answers.length === 0}>
      {(saved) => (
        <>
          {saved.signs.length > 0 && (
            <SavedGroup title="Letreros">
              {saved.signs.map((s) => <SignRow key={s.id} sign={s} onOpen={onOpenSign} />)}
            </SavedGroup>
          )}
          {saved.questions.length > 0 && (
            <SavedGroup title="Preguntas">
              {saved.questions.map((q) => <QuestionRow key={q.id} question={q} onOpen={onOpenQuestion} />)}
            </SavedGroup>
          )}
          {saved.answers.length > 0 && (
            <SavedGroup title="Respuestas">
              {saved.answers.map((a) => <AnswerRow key={a.id} answer={a} onOpen={onOpenQuestion} />)}
            </SavedGroup>
          )}
        </>
      )}
    </ListState>
  );
}

function SavedGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="activity__group">{title}</h3>
      <ul className="rows rows--links">{children}</ul>
    </>
  );
}

// ---------- rows ----------

const InReview = () => <span className="tag tag--muted">En revisión</span>;

function QuestionRow({ question: q, onOpen }: { question: Question; onOpen: (id: number) => void }) {
  const status = q.status === 'solved' ? 'Solucionada' : q.status === 'closed' ? 'Cerrada' : null;
  const answers = q.answerCount === 1 ? '1 respuesta' : `${q.answerCount} respuestas`;
  return (
    <li>
      <button type="button" className="row__link" onClick={() => onOpen(q.id)}>
        <span className="row__main">
          <span className="activity__text">{q.text}</span>
          <span className="meta activity__meta">
            {q.inReview && <InReview />}
            {status && <span className={status === 'Solucionada' ? 'tag tag--ok' : 'tag tag--muted'}>{status}</span>}
            <span>{answers} · {timeAgo(q.createdAt)}</span>
          </span>
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </li>
  );
}

function AnswerRow({ answer: a, onOpen }: { answer: Answer; onOpen: (id: number) => void }) {
  return (
    <li>
      <button type="button" className="row__link" onClick={() => onOpen(a.questionId)}>
        <span className="row__main">
          <span className="activity__text">{a.text}</span>
          <span className="meta activity__meta">
            {a.inReview && <InReview />}
            <span>{timeAgo(a.createdAt)}</span>
          </span>
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </li>
  );
}

function SignRow({ sign: s, onOpen }: { sign: Sign; onOpen: (sign: Sign) => void }) {
  return (
    <li>
      <button type="button" className="row__link" onClick={() => onOpen(s)}>
        <span className="activity__thumb">
          <FadeImage key={s.thumbUrl} src={s.thumbUrl} alt="" width={48} height={48} loading="lazy" decoding="async" />
        </span>
        <span className="row__main">
          <span className="activity__text">{s.title}</span>
          <span className="meta activity__meta">
            {s.inReview && <InReview />}
            <span>{s.zone} · {timeAgo(s.createdAt)}</span>
          </span>
        </span>
        <ChevronRightIcon size={20} />
      </button>
    </li>
  );
}

// ---------- states ----------

type QueryState<T> = { data: T | undefined; isPending: boolean; isError: boolean; refetch: () => unknown };

type ListStateProps<T> = {
  query: QueryState<T>;
  empty: ReactNode;
  children: (data: T) => ReactNode;
  /** Lists are empty with no items; other shapes (Guardados) say it themselves. */
  isEmpty?: (data: T) => boolean;
};

const isEmptyList = (data: unknown) => Array.isArray(data) && data.length === 0;

function ListState<T>({ query, empty, children, isEmpty = isEmptyList }: ListStateProps<T>) {
  if (query.isPending) {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">Cargando…</p>
        <ul className="rows">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="skeleton" style={{ height: '2.75rem', flex: 1 }} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <div className="activity__empty">
        <p className="empty__text">Algo falló, intenta de nuevo</p>
        <button type="button" className="btn btn--secondary btn--small" onClick={() => query.refetch()}>Reintentar</button>
      </div>
    );
  }
  if (query.data === undefined || isEmpty(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

function Empty({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="activity__empty">
      <p className="empty__text">{text}</p>
      <button type="button" className="btn btn--secondary btn--small" onClick={onAction}>{action}</button>
    </div>
  );
}
