// «Tocar otra vez la pestaña en la que estás» refreshes it (wiki #181): the way to see what others published on a
// computer, where there is no pull-to-refresh.
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';

export type RefreshTarget = 'signs' | 'questions' | 'me';

export function useRefresh(): (target: RefreshTarget) => void {
  const client = useQueryClient();
  return (target) => {
    if (target === 'signs') invalidate(client, keys.signs());
    else if (target === 'questions') invalidate(client, keys.questions());
    else invalidate(client, keys.wallet(), keys.activity(), keys.saved());
  };
}
