// Push notifications (SPEC 15): the account's preferences (profiles.notif_prefs) and this device's subscription.
import { DEFAULT_NOTIF_PREFS, type DataApi, type NotifPrefs } from '../api';
import { supabase } from './client';
import { requireMe } from './me';
import { rpc, toDataError } from './rpc';

/** The 4 switches from whatever is stored: a missing or non-boolean key means on (#204). */
function prefsOf(stored: unknown): NotifPrefs {
  const raw = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  return {
    answers: raw.answers !== false,
    helpful: raw.helpful !== false,
    contacts: raw.contacts !== false,
    urgent: raw.urgent !== false,
  };
}

async function storedPrefs(id: number): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('profiles').select('notif_prefs').eq('id', id).single<{ notif_prefs: unknown }>();
  if (error) throw toDataError(error);
  return typeof data.notif_prefs === 'object' && data.notif_prefs !== null ? (data.notif_prefs as Record<string, unknown>) : {};
}

export const supabasePush: DataApi['push'] = {
  async getPrefs() {
    const me = await requireMe();
    return prefsOf({ ...DEFAULT_NOTIF_PREFS, ...(await storedPrefs(me.id)) });
  },

  async setPrefs(prefs) {
    const me = await requireMe();
    // Other keys in the column are kept
    const next = { ...(await storedPrefs(me.id)), ...prefs };
    const { error } = await supabase.from('profiles').update({ notif_prefs: next }).eq('id', me.id);
    if (error) throw toDataError(error);
    return prefsOf(next);
  },

  async saveSubscription({ endpoint, p256dh, auth }) {
    await requireMe();
    await rpc<void>('save_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  },

  async deleteSubscription(endpoint) {
    await requireMe();
    await rpc<void>('delete_push_subscription', { p_endpoint: endpoint });
  },
};
