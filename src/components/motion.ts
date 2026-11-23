// «Changed while on screen» vs «first render» (SPEC 28). Every attention detail plays only on a change after the
// screen opened, so it marks news, never loading. Both hooks are pure bookkeeping: they never animate anything.
import { useLayoutEffect, useRef, useState } from 'react';
import type { Id } from '../data';

type Change = { tick: number; direction: 'up' | 'down' | null };

/**
 * A number that goes up each time `value` changes after its first known (non-null) value. Use it as a React `key` to
 * replay a CSS animation, or compare with 0 to skip the first render. `direction` says whether the last change went
 * up or down (numbers only). `null` means «not known yet» (loading): going from null to a value is not a change.
 */
export function useChangeTick<T>(value: T | null | undefined): Change {
  const last = useRef<T | null>(null);
  const [change, setChange] = useState<Change>({ tick: 0, direction: null });

  // Before paint, so the replayed animation starts on the frame where the new value shows
  useLayoutEffect(() => {
    if (value === null || value === undefined) return;
    const previous = last.current;
    last.current = value;
    if (previous === null || Object.is(previous, value)) return;
    const direction = typeof value === 'number' && typeof previous === 'number' ? (value > previous ? 'up' : 'down') : null;
    setChange((current) => ({ tick: current.tick + 1, direction }));
  }, [value]);

  return change;
}

/**
 * The ids in `ids` that were not there on the first loaded render: what arrived while on screen. `undefined` means
 * «not loaded yet»; an empty list is a loaded baseline, so the first answer to a question with none still counts.
 * Ids are compared, not objects, so a refetch that rebuilds the list marks nothing.
 */
export function useArrivedIds(ids: readonly Id[] | undefined): ReadonlySet<Id> {
  const baseline = useRef<Set<Id> | null>(null);
  const arrived = useRef(new Set<Id>());
  if (ids !== undefined) {
    if (baseline.current === null) baseline.current = new Set(ids);
    else for (const id of ids) if (!baseline.current.has(id)) arrived.current.add(id);
  }
  return arrived.current;
}
