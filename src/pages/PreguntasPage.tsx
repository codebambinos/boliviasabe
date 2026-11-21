// ¿Alguien sabe? (wiki › flujo-final › «2 · ¿Alguien sabe?», SPEC 10): search, tag chips and the list of
// questions in the wiki order (urgent → your zone → city → solved/closed), 30 + «Ver más». The shell owns
// the city, Preguntar and the open conversation; this page reads them through useShell().
import { useEffect, useState } from 'react';
import { ChipRow } from '../components/ChipRow';
import { Hint } from '../components/Hint';
import { SearchIcon } from '../components/icons';
import { errorMessage } from '../components/messages';
import { PullIndicator } from '../components/PullIndicator';
import { QuestionCard, QuestionCardSkeleton } from '../components/QuestionCard';
import { usePullToRefresh } from '../components/usePullToRefresh';
import { useShell } from '../components/useShell';
import { TAGS, useQuestions, type Tag } from '../data';

export function PreguntasPage() {
  const { city, openQuestion, selectedQuestion, openAsk } = useShell();
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const questions = useQuestions({ city, search, tags });
  const pull = usePullToRefresh(() => questions.refetch(), { enabled: !questions.isPending });

  // While the list is on screen the browser's own pull-to-reload stays off (our pull refreshes the list)
  useEffect(() => {
    const root = document.documentElement;
    root.style.overscrollBehaviorY = 'contain';
    return () => {
      root.style.overscrollBehaviorY = '';
    };
  }, []);

  const items = questions.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  const filtering = search.trim() !== '' || tags.length > 0;
  const clear = () => {
    setSearch('');
    setTags([]);
  };

  return (
    <>
      <h1 className="screen-title">¿Alguien sabe?</h1>
      <PullIndicator state={pull.state} distance={pull.distance} />
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
              <li key={question.id}>
                <QuestionCard question={question} selected={question.id === selectedQuestion} onOpen={(q) => openQuestion(q.id)} />
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
