// Horizontal row of chips (tag filters). Touch: swipe sideways. Mouse: arrow buttons at the edges
// and the vertical wheel scrolls sideways. Edges fade only where more chips are hidden.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import './chip-row.css';

type ChipRowProps = { label: string; children: ReactNode };

export function ChipRow({ label, children }: ChipRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const measure = () => {
      const max = row.scrollWidth - row.clientWidth;
      setMore({ start: row.scrollLeft > 1, end: row.scrollLeft < max - 1 });
    };
    // A mouse wheel only scrolls vertically: turn it sideways while the row can still move.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      const next = row.scrollLeft + event.deltaY;
      if (max <= 0 || (next <= 0 && row.scrollLeft <= 0) || (next >= max && row.scrollLeft >= max)) return;
      event.preventDefault();
      row.scrollLeft = next;
    };
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    row.addEventListener('wheel', onWheel, { passive: false });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => {
      row.removeEventListener('scroll', measure);
      row.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  }, []);

  const page = (direction: 1 | -1) => {
    const row = ref.current;
    if (!row) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row.scrollBy({ left: direction * row.clientWidth * 0.7, behavior: smooth ? 'smooth' : 'auto' });
  };

  return (
    <div className="chip-scroller" data-more-start={more.start || undefined} data-more-end={more.end || undefined}>
      <div ref={ref} className="chip-row" role="group" aria-label={label}>
        {children}
      </div>
      <button type="button" className="chip-scroller__btn chip-scroller__btn--prev" aria-label="Ver etiquetas anteriores" tabIndex={-1} onClick={() => page(-1)}>
        <ChevronLeftIcon size={20} />
      </button>
      <button type="button" className="chip-scroller__btn chip-scroller__btn--next" aria-label="Ver más etiquetas" tabIndex={-1} onClick={() => page(1)}>
        <ChevronRightIcon size={20} />
      </button>
    </div>
  );
}
