// Hoy (wiki › flujo-final › «1 · Hoy», SPEC 05): search, tag chips and the letreros grid grouped as
// Hoy · Esta semana · Antes, with pull-to-refresh on touch screens. The shell (ShellLayout) owns
// the city, the lupa, the letrero detail and Guardar; this page reads them through useShell().
import { useEffect, useState } from 'react';
import { ChipRow } from '../components/ChipRow';
import { SearchIcon } from '../components/icons';
import { Hint } from '../components/Hint';
import { errorMessage } from '../components/messages';
import { PullIndicator } from '../components/PullIndicator';
import { SignTile, SignTileSkeleton } from '../components/SignTile';
import { feedSection, type FeedSection } from '../components/time';
import { usePullToRefresh, withTabRefresh } from '../components/usePullToRefresh';
import { useShell } from '../components/useShell';
import { DEFAULT_CITY, REDEEM_ENABLED, TAGS, useFeaturedSigns, useSigns, useTabRefreshing, type Sign, type Tag } from '../data';

const SECTION_TITLE: Record<FeedSection, string> = { hoy: 'Hoy', semana: 'Esta semana', antes: 'Antes' };

export function HoyPage() {
  const { city, setCity: onCity, searchRef, openSign: onOpen, onToggleSave, freshSignId } = useShell();
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const signs = useSigns({ city, search, tags });
  // «Destacados» (SPEC 30): only with the redemption on; hidden while searching or filtering
  const featured = useFeaturedSigns(city, { enabled: REDEEM_ENABLED });
  const pull = usePullToRefresh(() => Promise.all([signs.refetch(), REDEEM_ENABLED ? featured.refetch() : null]), {
    enabled: !signs.isPending,
  });
  const indicator = withTabRefresh(pull, useTabRefreshing('signs'));

  // While Hoy is on screen the browser's own pull-to-reload stays off (our pull refreshes the list)
  useEffect(() => {
    const root = document.documentElement;
    root.style.overscrollBehaviorY = 'contain';
    return () => {
      root.style.overscrollBehaviorY = '';
    };
  }, []);
  const items = signs.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (tag: Tag) => setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  const filtering = search.trim() !== '' || tags.length > 0;
  const clear = () => {
    setSearch('');
    setTags([]);
  };

  // Hoy · Esta semana · Antes (wiki #140); the list is newest first, so sections come in order
  const now = new Date();
  const sections: { id: FeedSection; items: Sign[] }[] = [];
  for (const sign of items) {
    const id = feedSection(sign.createdAt, now);
    const last = sections[sections.length - 1];
    if (last?.id === id) last.items.push(sign);
    else sections.push({ id, items: [sign] });
  }

  return (
    <>
      {/* The city is in the top bar and the first section says «Hoy» (DESIGN.md) */}
      <h1 className="sr-only">Hoy en {city}</h1>
      <PullIndicator state={indicator.state} distance={indicator.distance} what="letreros" />
      <Hint id="hoy">Si un letrero te sirve, ábrelo y dale «Me sirvió»: quien lo subió gana una yapita.</Hint>
      <div className="search">
        <label className="sr-only" htmlFor="search">Buscar letreros</label>
        <SearchIcon className="search__icon" size={20} />
        <input
          ref={searchRef}
          id="search"
          className="input search__input"
          type="search"
          enterKeyHint="search"
          placeholder="Buscar: almuerzo, trufi, feria…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <a className="skip-link skip-link--inline" href="#letreros">Saltar a los letreros</a>
      <ChipRow label="Filtrar por etiqueta">
        {TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
            {tag}
          </button>
        ))}
      </ChipRow>

      <div id="letreros" tabIndex={-1} aria-busy={signs.isPending || signs.isPlaceholderData || undefined} data-stale={signs.isPlaceholderData || undefined}>
        {filtering && signs.isSuccess && items.length > 0 && (
          <p className="filter-summary" role="status">
            <span>
              {items.length === 1 ? '1 letrero' : `${items.length}${signs.hasNextPage ? '+' : ''} letreros`}
              {tags.length > 0 && ` · ${tags.join(', ')}`}
            </span>
            <button type="button" className="link-btn" onClick={clear}>Quitar filtros</button>
          </p>
        )}

        {signs.isPending && (
          <>
            <p className="sr-only" role="status">Cargando letreros…</p>
            <div className="tile-grid">
              {[0, 1, 2, 3].map((i) => <SignTileSkeleton key={i} />)}
            </div>
          </>
        )}
        {signs.isError && !signs.data && (
          <div className="empty" role="alert">
            <h2 className="empty__title">{errorMessage(signs.error)}</h2>
            <p className="empty__text">Tus filtros y lo que escribiste siguen aquí.</p>
            <button type="button" className="btn btn--secondary" onClick={() => signs.refetch()}>Reintentar</button>
          </div>
        )}
        {signs.isSuccess && items.length === 0 && filtering && (
          <div className="empty" role="status">
            <h2 className="empty__title">No encontramos letreros con eso</h2>
            <p className="empty__text">Prueba con otra palabra o quita las etiquetas.</p>
            <button type="button" className="btn btn--secondary" onClick={clear}>Quitar filtros</button>
          </div>
        )}
        {signs.isSuccess && items.length === 0 && !filtering && (
          <div className="empty">
            <h2 className="empty__title">Tu ciudad recién empieza</h2>
            <p className="empty__text">Sube el primer letrero de {city} con el botón «Subir letrero».</p>
            {city !== DEFAULT_CITY && (
              <button type="button" className="btn btn--secondary" onClick={() => onCity(DEFAULT_CITY)}>Ver {DEFAULT_CITY}</button>
            )}
          </div>
        )}
        {REDEEM_ENABLED && !filtering && signs.isSuccess && (featured.data?.length ?? 0) > 0 && (
          <section className="feed-section" aria-labelledby="sec-destacados">
            <div className="feed-section__head">
              <h2 id="sec-destacados" className="feed-section__title">Destacados</h2>
            </div>
            <ul className="tile-grid">
              {featured.data?.map((sign) => (
                <li key={sign.id}>
                  <SignTile sign={sign} onOpen={onOpen} onToggleSave={onToggleSave} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {sections.map((section) => (
          <section key={section.id} className="feed-section" aria-labelledby={`sec-${section.id}`}>
            <div className="feed-section__head">
              <h2 id={`sec-${section.id}`} className="feed-section__title">{SECTION_TITLE[section.id]}</h2>
              {section.id === 'antes' && <span className="meta">Puede estar desactualizado</span>}
            </div>
            <ul className="tile-grid">
              {section.items.map((sign) => (
                <li key={sign.id} className={sign.id === freshSignId ? 'tile-fresh' : undefined}>
                  <SignTile sign={sign} onOpen={onOpen} onToggleSave={onToggleSave} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {signs.hasNextPage && (
          <button type="button" className="btn btn--secondary btn--full" style={{ marginTop: 'var(--s-6)' }} disabled={signs.isFetchingNextPage} onClick={() => signs.fetchNextPage()}>
            {signs.isFetchingNextPage ? 'Cargando…' : 'Ver más letreros'}
          </button>
        )}
      </div>
    </>
  );
}

