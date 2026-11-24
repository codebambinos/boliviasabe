// Redemption with partner businesses (SPEC 29): the offers, paying one, and a receipt.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate, queryClient } from '../query';
import { api } from '../source';
import type { Id } from '../types';

/** Whether the redemption is switched on in this build (`VITE_CANJE_ENABLED=true`). The server has its own switch. */
export const REDEEM_ENABLED = import.meta.env.VITE_CANJE_ENABLED === 'true';

/** The active offers in the caller's city, cheapest first. */
export function useOffers(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.offers(), queryFn: () => api.redemptions.offers(), enabled: options.enabled ?? true });
}

/** `mutate(offerId)`: resolves to the receipt. Balance, Movimientos and the offers refresh afterwards, also on failure. */
export function useRedeem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (offerId: Id) => api.redemptions.redeem(offerId),
    onSuccess: (receipt) => client.setQueryData(keys.redemption(receipt.id), receipt),
    // keys.redemptions() covers the offers list and every letrero's offers box (SPEC 30)
    onSettled: () => invalidate(client, keys.wallet(), keys.redemptions(), keys.featuredSigns()),
  });
}

/** The «Acepta yapitas» box of a letrero (SPEC 30): its author's active offers. */
export function useSignOffers(signId: Id, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.signOffers(signId),
    queryFn: () => api.redemptions.offersForSign(signId),
    enabled: options.enabled ?? true,
  });
}

/** The offers of a letrero outside a component (a «Canjear» coming back from Google, SPEC 30). */
export function fetchSignOffers(signId: Id) {
  return queryClient.fetchQuery({ queryKey: keys.signOffers(signId), queryFn: () => api.redemptions.offersForSign(signId), staleTime: 0 });
}

/** One receipt, opened again from Movimientos. */
export function useRedemption(id: Id | null) {
  return useQuery({
    queryKey: keys.redemption(id ?? 0),
    queryFn: () => api.redemptions.get(id as Id),
    enabled: id !== null,
    staleTime: Infinity, // a confirmed receipt never changes
  });
}
