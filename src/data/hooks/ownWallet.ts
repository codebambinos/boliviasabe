// Own Pollar wallet (SPEC 31): status and balance, linking, and the mainnet redemption.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Id } from '../types';

/** `VITE_MAINNET_ENABLED=true` shows the card at all; the server still decides who is invited. */
export const MAINNET_ENABLED = import.meta.env.VITE_MAINNET_ENABLED === 'true';

export function useOwnWallet(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.ownWallet(), queryFn: () => api.ownWallet.status(), enabled: (options.enabled ?? true) && MAINNET_ENABLED });
}

export function useLinkOwnWallet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (pollarToken: string) => api.ownWallet.link(pollarToken),
    onSettled: () => invalidate(client, keys.ownWallet()),
  });
}

export function useOwnOffers(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: keys.ownOffers(), queryFn: () => api.ownWallet.offers(), enabled: options.enabled ?? true });
}

export function useStartOwnRedeem() {
  return useMutation({ mutationFn: (offerId: Id) => api.ownWallet.startRedeem(offerId) });
}

export function useConfirmOwnRedeem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ redemptionId, txHash }: { redemptionId: Id; txHash: string }) => api.ownWallet.confirmRedeem(redemptionId, txHash),
    onSettled: () => invalidate(client, keys.ownWallet(), keys.ownOffers()),
  });
}
