// Letrero detail (wiki #139, #141): full screen on a phone, a window over the grid on desktop.
// Holds every action of the letrero; Me sirvió is the main one.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDataError, useVoteSign, type Sign } from '../data';
import { ArrowLeftIcon, BookmarkIcon, CloseIcon, MapIcon, MoreIcon, PinIcon, ThumbIcon } from './icons';
import { isStale, timeAgo } from './time';
import './sign-sheet.css';

type SignSheetProps = {
  sign: Sign;
  onClose: () => void;
  onToggleSave?: (sign: Sign) => void;
};

const EXIT_MS = 160;

function mapsHref(sign: Sign): string {
  if (sign.mapsUrl) return sign.mapsUrl;
  const query = `${sign.title} ${sign.zone} ${sign.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function SignSheet({ sign: initial, onClose, onToggleSave }: SignSheetProps) {
  const [closing, setClosing] = useState(false);
  const [sign, setSign] = useState(initial);
  const panel = useRef<HTMLDivElement>(null);
  const vote = useVoteSign();

  const close = () => {
    if (closing) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setClosing(true);
    window.setTimeout(onClose, reduced ? 0 : EXIT_MS);
  };

  // Focus moves into the sheet and back to the tile on close; the page behind does not scroll;
  // Escape closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      opener?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const helped = sign.myVote === 'helpful';
  // Wiki copy only; the data layer's own messages are for developers. The soft wall will open
  // «Crea tu cuenta para seguir» instead of this line.
  const voteError = !vote.error
    ? null
    : isDataError(vote.error) && vote.error.code === 'unauthenticated'
      ? 'Crea tu cuenta para seguir'
      : isDataError(vote.error) && vote.error.code === 'offline'
        ? 'Sin conexión, intenta de nuevo'
        : 'No pudimos guardar tu voto, intenta de nuevo';

  return createPortal(
    <div className="sheet" data-closing={closing || undefined}>
      <div className="sheet__scrim" onClick={close} aria-hidden="true" />
      <div ref={panel} className="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabIndex={-1}>
        <header className="sheet__bar">
          {/* Phone: a page, so ← Volver. Desktop: a window, so ✕. */}
          <button type="button" className="icon-btn sheet__back" aria-label="Volver" onClick={close}>
            <ArrowLeftIcon className="sheet__icon-phone" />
            <CloseIcon className="sheet__icon-desk" />
          </button>
          <span className="sheet__bar-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={sign.savedByMe ? 'Quitar de guardados' : 'Guardar'}
              aria-pressed={sign.savedByMe}
              onClick={() => {
                setSign((s) => ({ ...s, savedByMe: !s.savedByMe }));
                onToggleSave?.(sign);
              }}
            >
              <BookmarkIcon fill={sign.savedByMe ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="icon-btn" aria-label="Más opciones">
              <MoreIcon />
            </button>
          </span>
        </header>

        <div className="sheet__body">
          <div className="sheet__photo">
            <img src={sign.photoUrl} alt={sign.title} />
          </div>
          <div className="sheet__info">
            {sign.price && <p className="sheet__price">{sign.price}</p>}
            <h2 id="sheet-title" className="sheet__title">{sign.title}</h2>
            <p className="meta meta--icon">
              <PinIcon size={16} />
              <span>{sign.zone}, {sign.city}</span>
            </p>
            <p className="meta">
              Subido por {sign.author.displayName} · {sign.author.badge} · {timeAgo(sign.createdAt)}
            </p>
            {sign.helpfulCount > 0 && <p className="meta">A {sign.helpfulCount} les sirvió</p>}
            {isStale(sign.createdAt) && <p className="notice">Puede estar desactualizado</p>}
            {sign.tags.length > 0 && (
              <p className="sheet__tags">
                {sign.tags.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </p>
            )}
          </div>
        </div>

        <footer className="sheet__actions">
          {!sign.isMine && (
            <button
              type="button"
              className={helped ? 'btn btn--secondary' : 'btn'}
              aria-pressed={helped}
              disabled={helped || sign.myVote !== null || vote.isPending}
              onClick={() =>
                vote.mutate({ id: sign.id, value: 'helpful' }, { onSuccess: (updated) => setSign(updated) })
              }
            >
              <ThumbIcon size={20} /> {helped ? 'Te sirvió' : 'Me sirvió'}
            </button>
          )}
          <a className="btn btn--secondary" href={mapsHref(sign)} target="_blank" rel="noreferrer">
            <MapIcon size={20} /> Cómo llegar
          </a>
          {voteError && (
            <p className="sheet__error" role="alert">{voteError}</p>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
