// `signs` of the Supabase adapter (SPEC 11, T39). Reads come from SQL functions that already apply the
// hidden and in-review rules and fill the per-caller fields (my vote, saved by me, mine).
import type { DataApi } from '../api';
import type { Page, Sign } from '../types';
import { supabase } from './client';
import { requireMe } from './me';
import { pathOf, removePaths, uploadPhotos } from './photos';
import { requestReward } from './rewards';
import { offsetOf, rpc, toDataError } from './rpc';

const getSign = (id: number) => rpc<Sign>('get_sign', { p_id: id });

export const supabaseSigns: DataApi['signs'] = {
  list: ({ city, search, tags, cursor }) =>
    rpc<Page<Sign>>('list_signs', {
      p_city: city,
      p_search: search?.trim() || null,
      p_tags: tags?.length ? tags : null,
      p_offset: offsetOf(cursor),
    }),

  get: getSign,

  /** Upload first, insert second; a failed insert removes the uploaded files. The +1 is asked after saving. */
  async create(input) {
    const me = await requireMe();
    const photos = await uploadPhotos(me.id, input.photo, input.thumb);
    const { data, error } = await supabase
      .from('signs')
      .insert({
        author_id: me.id,
        title: input.title.trim(),
        photo_url: photos.photoUrl,
        photo_thumb_url: photos.thumbUrl,
        price: input.price?.trim() || null,
        city: me.city, // the letrero always goes to the profile's city (wiki #167)
        zone: input.zone?.trim() || me.zone,
        tags: input.tags ?? [],
        maps_url: input.mapsUrl?.trim() || null,
      })
      .select('id')
      .single<{ id: number }>();
    if (error) {
      await removePaths(photos.paths);
      throw toDataError(error);
    }
    requestReward('letrero', data.id);
    // The daily cap of rewarded letreros is T23; until then every letrero is rewarded.
    return { sign: await getSign(data.id), rewarded: true };
  },

  /** One final vote per person; the database refuses a vote on one's own letrero. */
  async vote(id, value) {
    const me = await requireMe();
    const { error } = await supabase.from('sign_votes').insert({ sign_id: id, voter_id: me.id, helpful: value === 'helpful' });
    if (error) throw toDataError(error);
    if (value === 'helpful') requestReward('sirvio-l', id);
    return getSign(id);
  },

  /** The yapitas already earned stay (wiki). The photos go after the row. */
  async remove(id) {
    const { data } = await supabase.from('signs').select('photo_url, photo_thumb_url').eq('id', id).maybeSingle<{ photo_url: string; photo_thumb_url: string }>();
    await rpc<void>('remove_sign', { p_id: id });
    const paths = [pathOf(data?.photo_url ?? null), pathOf(data?.photo_thumb_url ?? null)].filter((p): p is string => p !== null);
    await removePaths([...new Set(paths)]);
  },
};
