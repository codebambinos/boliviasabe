// `saved` and `reports` of the Supabase adapter (SPEC 11, T39). The SQL functions check that the item
// exists and is visible; three reports from different people hide it for everyone but its author.
import type { DataApi, SavedItems } from '../api';
import { rpc } from './rpc';

export const supabaseSaved: DataApi['saved'] = {
  toggle: (kind, id) => rpc<boolean>('toggle_saved', { p_kind: kind, p_id: id }),
  list: () => rpc<SavedItems>('saved_items'),
};

export const supabaseReports: DataApi['reports'] = {
  report: (kind, id, reason) => rpc<void>('report_content', { p_kind: kind, p_id: id, p_reason: reason }),
  hideForMe: (kind, id) => rpc<void>('hide_content', { p_kind: kind, p_id: id }),
};
