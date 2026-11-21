// `signs` of the Supabase adapter (SPEC 11, T39). Reads come from SQL functions that already apply the
// hidden and in-review rules and fill the per-caller fields (my vote, saved by me, mine).
import type { DataApi } from '../api';
import type { Page, Sign } from '../types';
import { offsetOf, rpc } from './rpc';

export const supabaseSigns: Pick<DataApi['signs'], 'list' | 'get'> = {
  list: ({ city, search, tags, cursor }) =>
    rpc<Page<Sign>>('list_signs', {
      p_city: city,
      p_search: search?.trim() || null,
      p_tags: tags?.length ? tags : null,
      p_offset: offsetOf(cursor),
    }),

  get: (id) => rpc<Sign>('get_sign', { p_id: id }),
};
