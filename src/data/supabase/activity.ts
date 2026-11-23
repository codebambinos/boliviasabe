// `activity` and Movimientos of the Supabase adapter (SPEC 11, T39). Movimientos is the caller's `rewards`
// rows (RLS: own rows only), each with its transaction link; the balance itself is read from the chain.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import { PAGE_SIZE } from '../catalog';
import type { Answer, Movement, Question, Sign } from '../types';
import { supabase } from './client';
import { requireMe } from './me';
import { retryReward } from './rewards';
import { offsetOf, rpc, toDataError } from './rpc';

const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx/';
const COLUMNS = 'id, reason, amount, created_at, status, tx_hash, redemption:redemptions(id, partner:partners(name))';

type RewardRow = {
  id: number;
  reason: Movement['reason'];
  amount: number;
  created_at: string;
  status: Movement['status'];
  tx_hash: string | null;
  redemption: { id: number; partner: { name: string } | null } | null;
};

const toMovement = (row: RewardRow): Movement => ({
  id: row.id,
  reason: row.reason,
  amount: row.amount,
  createdAt: new Date(row.created_at).toISOString(),
  status: row.status,
  txHash: row.tx_hash,
  explorerUrl: row.tx_hash ? EXPLORER_TX + row.tx_hash : null,
  ...(row.redemption?.partner
    ? { redemption: { id: row.redemption.id, partnerName: row.redemption.partner.name, side: row.amount < 0 ? 'paid' : 'received' } }
    : {}),
});

export const supabaseActivity: DataApi['activity'] = {
  myQuestions: () => rpc<Question[]>('my_questions'),
  myAnswers: () => rpc<Answer[]>('my_answers'),
  mySigns: () => rpc<Sign[]>('my_signs'),
};

export const supabaseMovements: Pick<DataApi['wallet'], 'movements' | 'retry'> = {
  /** Newest first, 30 per page. A failed urgent charge charged nothing, so it is not a movement. */
  async movements(query) {
    const me = await requireMe();
    const from = offsetOf(query?.cursor);
    const { data, error } = await supabase
      .from('rewards')
      .select(COLUMNS)
      .eq('profile_id', me.id)
      .or('reason.not.in.(urgente,canje),status.neq.error') // a charge that failed charged nothing
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE) // one extra row tells whether there is a next page
      .returns<RewardRow[]>();
    if (error) throw toDataError(error);
    return {
      items: data.slice(0, PAGE_SIZE).map(toMovement),
      nextCursor: data.length > PAGE_SIZE ? String(from + PAGE_SIZE) : null,
    };
  },

  /** «Reintentar» on a reward that stayed pending or failed. The server pays it once. */
  async retry(movementId) {
    await retryReward(movementId);
    const { data, error } = await supabase.from('rewards').select(COLUMNS).eq('id', movementId).maybeSingle<RewardRow>();
    if (error) throw toDataError(error);
    if (!data) throw new DataError('not_found', 'Movement not found');
    return toMovement(data);
  },
};
