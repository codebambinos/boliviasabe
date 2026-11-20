// Letrero tile for the Hoy grid (wiki #138-139): photo with the price on it, Guardar on the photo,
// title, zone · time and «A N les sirvió». The whole tile opens the detail; other actions live there.
import type { Sign } from '../data';
import { BookmarkIcon, ThumbIcon } from './icons';
import { timeAgo } from './time';
import './sign-tile.css';

type SignTileProps = {
  sign: Sign;
  onOpen: (sign: Sign) => void;
  onToggleSave?: (sign: Sign) => void;
};

export function SignTile({ sign, onOpen, onToggleSave }: SignTileProps) {
  return (
    <article className="tile">
      <div className="tile__media">
        {/* Thumbnail in the grid (wiki #142): small file, loaded only when near the screen */}
        <img src={sign.thumbUrl} alt="" loading="lazy" decoding="async" />
        {sign.price && <span className="tile__price">{sign.price}</span>}
      </div>
      <h3 className="tile__title">
        {/* Stretched button: the whole tile is one tap target and works by keyboard */}
        <button type="button" className="tile__open" onClick={() => onOpen(sign)}>
          {sign.title}
        </button>
      </h3>
      <p className="tile__meta">
        {sign.zone} · {timeAgo(sign.createdAt)}
      </p>
      {sign.helpfulCount > 0 && (
        <p className="tile__meta tile__helped">
          <ThumbIcon size={14} aria-hidden="true" /> A {sign.helpfulCount} les sirvió
        </p>
      )}
      <button
        type="button"
        className="tile__save"
        aria-label={sign.savedByMe ? `Quitar «${sign.title}» de guardados` : `Guardar «${sign.title}»`}
        aria-pressed={sign.savedByMe}
        onClick={() => onToggleSave?.(sign)}
      >
        <BookmarkIcon size={18} fill={sign.savedByMe ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

export function SignTileSkeleton() {
  return (
    <div className="tile" aria-hidden="true">
      <div className="tile__media skeleton" />
      <div className="skeleton" style={{ height: '1rem', marginTop: 'var(--s-3)', width: '85%' }} />
      <div className="skeleton" style={{ height: '0.75rem', marginTop: 'var(--s-2)', width: '55%' }} />
    </div>
  );
}
