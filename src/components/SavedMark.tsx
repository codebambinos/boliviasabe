// The bookmark of ☆ Guardar (SPEC 28, B1). When it becomes saved with the screen open, it settles in from 0.85 to 1
// while it fills; unsaving, or a failed save going back, only changes color. Same icon and size as before.
import { BookmarkIcon } from './icons';
import { useChangeTick } from './motion';

export function SavedMark({ saved, size }: { saved: boolean; size?: number }) {
  const { tick } = useChangeTick(saved);
  const settle = saved && tick > 0;
  return (
    <span key={settle ? `saved-${tick}` : 'still'} className={settle ? 'saved-mark saved-mark--settle' : 'saved-mark'} aria-hidden="true">
      <BookmarkIcon size={size} fill={saved ? 'currentColor' : 'none'} />
    </span>
  );
}
