// The yapita mark: the orange disc with the drawn star. Orange never carries text.
import { StarIcon } from './icons';

export function Yapita({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`yapita yapita--${size}`} aria-hidden="true">
      <StarIcon size={size === 'lg' ? 22 : size === 'sm' ? 11 : 13} />
    </span>
  );
}
