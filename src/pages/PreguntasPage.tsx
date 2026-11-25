// ¿Alguien sabe? (wiki › flujo-final › «2 · ¿Alguien sabe?», SPEC 10): search, tag chips and the list of
// questions in the wiki order (urgent → your zone → city → solved/closed), 30 + «Ver más». The shell owns
// the city, Preguntar and the open conversation; this page reads them through useShell().
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChipRow } from '../components/ChipRow';
import { Hint } from '../components/Hint';
import { SearchIcon } from '../components/icons';
import { errorMessage } from '../components/messages';
import { PullIndicator } from '../components/PullIndicator';
import { QuestionCard, QuestionCardSkeleton } from '../components/QuestionCard';
import { usePullToRefresh, withTabRefresh } from '../components/usePullToRefresh';
import { useShell } from '../components/useShell';
import { TAGS, useQuestions, useTabRefreshing, type Id, type Tag } from '../data';

/** How long a question from Avisos stays framed before the frame fades (SPEC 24). */
const SPOTLIGHT_MS = 2800;

export function PreguntasPage() {
  const { city, openQuestion, selectedQuestion, goneQuestions, openAsk } = useShell();
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const questions = useQuestions({ city, search, tags });
  const pull = usePullToRefresh(() => questions.refetch(), { enabled: !questions.isPending });
  const indicator = withTabRefresh(pull, useTabRefreshing('questions'));

  // While the list is on screen the browser's own pull-to-reload stays off (our pull refreshes the list)
  useEffect(() => {
    const root = document.documentElement;
    root.style.overscrollBehaviorY = 'contain';
    return () => {
      root.style.overscrollBehaviorY = '';
    };
  }, []);

  const items = (questions.data?.pages.flatMap((page) => page.items) ?? []).filter((q) => !goneQuestions.has(q.id));

  // A question opened from Avisos (SPEC 24, wiki #216): once the list is in, scroll to its card and frame it for a
  // moment. The request is dropped from history so Back / a reload do not play it again. If the card is not in the
  // list (filters, an older page), the question opens directly (on desktop the panel already shows it).
  const location = useLocation();
  const navigate = useNavigate();
  const navState = location.state as { spotlight?: Id; focus?: unknown } | null;
  const wanted = navState?.spotlight ?? null;
  const [spotlight, setSpotlight] = useState<Id | null>(null);
  // Each request is handled once, even if the page renders again before history drops it
  const handled = useRef<Id | null>(null);
  const listReady = questions.isSuccess && !questions.isPlaceholderData;
  const wantedInList = wanted !== null && items.some((q) => q.id === wanted);
  useEffect(() => {
    if (wanted === null) {
      handled.current = null;
      return;
    }
    if (!listReady || handled.current === wanted) return;
    handled.current = wanted;
    // The panel's conversation may still need `focus` (the answer to frame): only the list's request is dropped
    const keep = navState?.focus ? { focus: navState.focus } : null;
    navigate(location.pathname + location.search, { replace: true, state: keep, preventScrollReset: true });
    if (!wantedInList) {
      if (!window.matchMedia('(min-width: 64rem)').matches) openQuestion(wanted);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Two frames: the screen change has painted and ScrollRestoration has run, so this scroll is the last word
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById(`q-card-${wanted}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        setSpotlight(wanted);
      }),
    );
  }, [wanted, listReady, wantedInList, navigate, location.pathname, location.search, openQuestion, navState?.focus]);
  useEffect(() => {
    if (spotlight === null) return;
    const done = window.setTimeout(() => setSpotlight(null), SPOTLIGHT_MS);
    return () => window.clearTimeout(done);
  }, [spotlight]);
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  const filtering = search.trim() !== '' || tags.length > 0;
  const clear = () => {
    setSearch('');
    setTags([]);
  };

  return (
    <>
      <h1 className="screen-title">¿Alguien sabe?</h1>
      <PullIndicator state={indicator.state} distance={indicator.distance} what="preguntas" />
      <Hint id="preguntas">Pregunta lo que necesites saber: quien te ayude gana yapitas.</Hint>
      <div className="search">
        <label className="sr-only" htmlFor="question-search">Buscar preguntas</label>
        <SearchIcon className="search__icon" size={20} />
        <input
          id="question-search"
          className="input search__input"
          type="search"
          enterKeyHint="search"
          placeholder="Buscar: plomero, farmacia, agua…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ChipRow label="Filtrar por etiqueta">
        {TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
            {tag}
          </button>
        ))}
      </ChipRow>

      <div id="preguntas-lista" aria-busy={questions.isPending || questions.isPlaceholderData || undefined} data-stale={questions.isPlaceholderData || undefined}>
        {filtering && questions.isSuccess && items.length > 0 && (
          <p className="filter-summary" role="status">
            <span>
              {items.length === 1 ? '1 pregunta' : `${items.length}${questions.hasNextPage ? '+' : ''} preguntas`}
              {tags.length > 0 && ` · ${tags.join(', ')}`}
            </span>
            <button type="button" className="link-btn" onClick={clear}>Quitar filtros</button>
          </p>
        )}

        {questions.isPending && (
          <>
            <p className="sr-only" role="status">Cargando preguntas…</p>
            <div className="qlist">
              {[0, 1, 2, 3].map((i) => <QuestionCardSkeleton key={i} />)}
            </div>
          </>
        )}
        {questions.isError && !questions.data && (
          <div className="empty" role="alert">
            <h2 className="empty__title">{errorMessage(questions.error)}</h2>
            <p className="empty__text">Tus filtros y lo que escribiste siguen aquí.</p>
            <button type="button" className="btn btn--secondary" onClick={() => questions.refetch()}>Reintentar</button>
          </div>
        )}
        {questions.isSuccess && items.length === 0 && filtering && (
          <div className="empty" role="status">
            <h2 className="empty__title">Nadie preguntó eso todavía</h2>
            <p className="empty__text">Sé el primero en preguntarlo: tus vecinos pueden ayudarte.</p>
            <div className="empty__actions">
              <button type="button" className="btn" onClick={() => openAsk(search.trim())}>Preguntar esto</button>
              <button type="button" className="btn btn--secondary" onClick={clear}>Quitar filtros</button>
            </div>
          </div>
        )}
        {questions.isSuccess && items.length === 0 && !filtering && (
          <div className="empty">
            <h2 className="empty__title">Sé el primero en preguntar en {city}</h2>
            <p className="empty__text">¿Buscas un plomero, una farmacia de turno o si hay agua en tu zona? Pregunta con el botón «Preguntar».</p>
            <button type="button" className="btn" onClick={() => openAsk()}>Preguntar</button>
          </div>
        )}
        {items.length > 0 && (
          <ul className="qlist">
            {items.map((question) => (
              // Its name for the «remove» transition: the card that leaves shrinks, the others slide into place
              <li key={question.id} id={`q-card-${question.id}`} style={{ '--vt-card': `q-${question.id}` } as CSSProperties}>
                <QuestionCard
                  question={question}
                  selected={question.id === selectedQuestion}
                  spotlight={question.id === spotlight}
                  onOpen={(q) => openQuestion(q.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {questions.hasNextPage && (
          <button type="button" className="btn btn--secondary btn--full" style={{ marginTop: 'var(--s-6)' }} disabled={questions.isFetchingNextPage} onClick={() => questions.fetchNextPage()}>
            {questions.isFetchingNextPage ? 'Cargando…' : 'Ver más preguntas'}
          </button>
        )}
      </div>
    </>
  );
}
