// Yo › Movimientos (wiki › 3 · Yo, #127, #157, #162, #213): the 5 most recent first, on every screen, then «Ver más» adds 10 more in place and «Ver menos» folds the list back.
// Each row: reason, ±yapitas, «hace…», its state and «Registro abcd…wxyz». Pendiente and Error offer «Reintentar».
// Motion: the list's height glides open or closed (one animation, no jump at the end); new rows rise in one after
// another, and the rows that go fade out while the list closes over them.
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useMovements, useRetryMovement, type Movement } from '../data';
import { ExternalIcon } from './icons';
import { formatAmount, REASON_LABEL, shortHash, STATUS_LABEL } from './movements';
import { timeAgo } from './time';
import { Yapita } from './Yapita';

const STEP = 10;
/** The most recent 5 first, on every screen: with more than 5 there is always «Ver más» (#157, #213). */
const FIRST = 5;
/** New rows enter one after another, 30 ms apart, never longer than 10 steps. */
const STAGGER_CAP = 10;
/** How long the list takes to open or close; the same curve as --ease. */
const RESIZE_MS = 320;
const RESIZE_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Glides `list` from one height to another, clipping what is outside. */
function resize(list: HTMLElement, from: number, to: number): Animation {
  list.style.overflow = 'hidden';
  return list.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: RESIZE_MS, easing: RESIZE_EASE, fill: 'forwards' });
}

export function MovementsCard() {
  const movements = useMovements();
  const retry = useRetryMovement();
  const first = FIRST;
  const [visible, setVisible] = useState(first);
  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // The list's height just before «Ver más» added rows: the opening glides from there
  const grownFrom = useRef<number | null>(null);
  // Rows from this index on just arrived through «Ver más»: they rise in
  const [revealFrom, setRevealFrom] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // «Ver menos» is playing: the extra rows fade while the list closes over them
  const [leaving, setLeaving] = useState(false);

  const all = movements.data?.pages.flatMap((page) => page.items) ?? [];
  const shown = all.slice(0, visible);
  const canShowMore = all.length > visible || movements.hasNextPage;

  // «Ver más»: the new rows are in the DOM now, before paint; open the list from its old height to the new one
  useLayoutEffect(() => {
    const list = listRef.current;
    const from = grownFrom.current;
    grownFrom.current = null;
    if (!list || from === null || reducedMotion()) return;
    const to = list.offsetHeight;
    if (to <= from) return;
    const opening = resize(list, from, to);
    const settle = () => {
      opening.cancel();
      list.style.overflow = '';
    };
    opening.finished.then(settle, settle);
  }, [visible]);

  const showMore = async () => {
    if (all.length < visible + STEP && movements.hasNextPage) {
      setLoadingMore(true);
      try {
        await movements.fetchNextPage();
      } finally {
        setLoadingMore(false);
      }
    }
    grownFrom.current = listRef.current?.offsetHeight ?? null;
    setRevealFrom(visible);
    setVisible((v) => v + STEP);
  };

  // Back to the first rows: the list closes over the extra ones in one movement, then the Movimientos heading comes
  // into view if it was above the screen, so the person does not lose their place.
  const showLess = () => {
    const reduced = reducedMotion();
    const list = listRef.current;
    const keepUntil = list?.children[first] as HTMLElement | undefined;
    const fold = () => {
      setLeaving(false);
      setRevealFrom(null);
      setVisible(first);
    };
    const bringTitle = () => {
      // The heading has the scroll margin that clears the sticky top bar
      const title = cardRef.current?.querySelector<HTMLElement>('.card__title');
      if (title && title.getBoundingClientRect().top < 0) title.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    };
    if (reduced || !list || !keepUntil) {
      fold();
      bringTitle();
      return;
    }
    const from = list.offsetHeight;
    const to = keepUntil.getBoundingClientRect().top - list.getBoundingClientRect().top;
    setRevealFrom(null);
    setLeaving(true);
    const closing = resize(list, from, to);
    const settle = () => {
      // Fold the list and drop the held height in the same frame: no flash of the long list
      flushSync(fold);
      closing.cancel();
      list.style.overflow = '';
      bringTitle();
    };
    closing.finished.then(settle, settle);
  };

  return (
    <div id="movimientos" ref={cardRef} className="card yo-grid__moves">
      <h2 id="movimientos-title" tabIndex={-1} className="card__title card__title--target">Movimientos</h2>
      {movements.isPending ? (
        <ul className="rows" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <div className="skeleton" style={{ height: '2.5rem', flex: 1 }} />
            </li>
          ))}
        </ul>
      ) : movements.isError && all.length === 0 ? (
        <>
          <p className="empty__text">Algo falló, intenta de nuevo</p>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => movements.refetch()}>Reintentar</button>
        </>
      ) : all.length === 0 ? (
        <p className="empty__text">Gana yapitas subiendo letreros y ayudando.</p>
      ) : (
        <ul ref={listRef} className="rows">
          {shown.map((m, i) => (
            <MovementRow
              key={m.id}
              movement={m}
              index={i}
              stagger={revealFrom !== null && i >= revealFrom ? Math.min(i - revealFrom, STAGGER_CAP) : null}
              leaving={leaving && i >= first}
              retrying={retry.isPending && retry.variables === m.id}
              onRetry={() => retry.mutate(m.id)}
            />
          ))}
        </ul>
      )}
      {all.length > 0 && (canShowMore || visible > first) && (
        <div className="moves__more">
          {canShowMore && (
            <button type="button" className="btn btn--secondary btn--small" disabled={loadingMore || leaving} onClick={showMore}>
              {loadingMore ? 'Cargando…' : 'Ver más'}
            </button>
          )}
          {visible > first && (
            <button type="button" className="btn btn--secondary btn--small" disabled={leaving} onClick={showLess}>
              Ver menos
            </button>
          )}
        </div>
      )}
      <p className="notice moves__notice">Red de pruebas, sin dinero real</p>
    </div>
  );
}

type MovementRowProps = {
  movement: Movement;
  /** Position in the batch that just arrived (it sets the entrance delay), or null when the row was already there. */
  stagger: number | null;
  /** «Ver menos» is closing the list over this row: it fades out. */
  leaving: boolean;
  /** Its place in the list: the coins float out of step (SPEC 28, block 4). */
  index: number;
  retrying: boolean;
  onRetry: () => void;
};

function MovementRow({ movement: m, index, stagger, leaving, retrying, onRetry }: MovementRowProps) {
  const stateClass = m.status === 'confirmed' ? 'state' : m.status === 'pending' ? 'state state--pending' : 'state state--error';
  return (
    <li
      className={leaving ? 'yo-sink' : stagger !== null ? 'yo-rise' : undefined}
      style={!leaving && stagger !== null ? { ['--i' as string]: stagger } : undefined}
    >
      {/* The coin floats 2 px and glints softly; each row out of step with the one above */}
      <span className="moves__coin" style={{ ['--float-delay' as string]: `${-(index % 5) * 0.35}s` }}>
        <Yapita shine="soft" />
      </span>
      <span className="row__main">
        {REASON_LABEL[m.reason]}
        <span className="meta row__sub">
          {timeAgo(m.createdAt)}
          {m.explorerUrl && m.txHash && (
            <a className="row__record" href={m.explorerUrl} target="_blank" rel="noreferrer">
              Registro {shortHash(m.txHash)}
              <ExternalIcon size={12} />
            </a>
          )}
        </span>
      </span>
      <span className="row__end">
        <span className="amount">{formatAmount(m.amount)}</span>
        {/* key: the chip cross-fades when the state changes (Error → Confirmado after «Reintentar») */}
        <span key={m.status} className={`${stateClass} yo-fade`}>{STATUS_LABEL[m.status]}</span>
        {m.status !== 'confirmed' && (
          <button type="button" className="link-btn moves__retry" disabled={retrying} onClick={onRetry}>
            {retrying ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </span>
    </li>
  );
}
