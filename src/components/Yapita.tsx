// The yapita mark: the orange disc with the drawn star. Orange never carries text.
// `shine` adds a cosmetic glint (SPEC 28, block 4): a light band crosses the coin every few seconds, and tiny sparks
// twinkle around it. `strong` (Yo's balance) and `medium` (the top-bar balance) glitter; `soft` (a Movimientos row)
// only glints.
// Purely decorative: nothing waits for it, and with reduced motion it rests.
import { StarIcon } from './icons';

export type YapitaShine = 'strong' | 'medium' | 'soft';

export function Yapita({ size = 'md', shine }: { size?: 'sm' | 'md' | 'lg'; shine?: YapitaShine }) {
  const disc = (
    <span className={`yapita yapita--${size}${shine ? ` yapita--shine yapita--shine-${shine}` : ''}`} aria-hidden="true">
      <StarIcon size={size === 'lg' ? 22 : size === 'sm' ? 11 : 13} />
    </span>
  );
  if (shine !== 'strong' && shine !== 'medium') return disc;
  return (
    <span className={`yapita-glitter yapita-glitter--${shine}`} aria-hidden="true">
      {disc}
      <span className="yapita-glitter__spark" />
      <span className="yapita-glitter__spark" />
      <span className="yapita-glitter__spark" />
    </span>
  );
}
