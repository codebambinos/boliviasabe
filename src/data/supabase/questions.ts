// `questions` of the Supabase adapter (SPEC 11, T39). Order, hidden items and per-caller fields come from the
// SQL functions; status changes go through `close_question` and `rate_answer`, never through the table.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Answer, Page, Question } from '../types';
import { supabase } from './client';
import { requireMe } from './me';
import { pathOf, removePaths, uploadPhotos } from './photos';
import { requestCharge, requestReward } from './rewards';
import { offsetOf, rpc, toDataError } from './rpc';

const getQuestion = (id: number) => rpc<{ question: Question; answers: Answer[] }>('get_question', { p_id: id });

export const supabaseQuestions: DataApi['questions'] = {
  list: ({ city, search, tags, cursor }) =>
    rpc<Page<Question>>('list_questions', {
      p_city: city,
      p_search: search?.trim() || null,
      p_tags: tags?.length ? tags : null,
      p_offset: offsetOf(cursor),
    }),

  get: getQuestion,

  similar: (text) => rpc<Question[]>('similar_questions', { p_text: text }),

  /**
   * Published as normal first. An urgent one is charged −5 by the server, which then makes it urgent for 24 h
   * (wiki #179); when the charge fails it stays normal and `urgentCharged` is false.
   */
  async create(input) {
    const me = await requireMe();
    const photo = input.photo instanceof Blob ? await uploadPhotos(me.id, input.photo) : null;
    const { data, error } = await supabase
      .from('questions')
      .insert({
        author_id: me.id,
        text: input.text.trim(),
        photo_url: photo?.photoUrl ?? null,
        city: me.city,
        zone: input.zone?.trim() || me.zone,
        tags: input.tags ?? [],
      })
      .select('id')
      .single<{ id: number }>();
    if (error) {
      if (photo) await removePaths(photo.paths);
      throw toDataError(error);
    }
    const urgentCharged = input.urgent ? await requestCharge(data.id) : false;
    const { question } = await getQuestion(data.id);
    return { question, urgentCharged };
  },

  /** Only mine and only without answers (RLS). An urgent question's yapitas are not returned. */
  async remove(id) {
    const { data, error } = await supabase.from('questions').delete().eq('id', id).select('photo_url');
    if (error) throw toDataError(error);
    if (!data.length) {
      await getQuestion(id); // rejects with not_found when it is gone
      throw new DataError('forbidden', 'Only your own question without answers can be deleted');
    }
    const path = pathOf((data[0] as { photo_url: string | null }).photo_url);
    if (path) await removePaths([path]);
  },

  /** «Ninguna me sirvió»: closed, and +1 for closing it (asked after saving). */
  async closeWithoutSolution(id) {
    const question = await rpc<Question>('close_question', { p_id: id });
    requestReward('cierre', id);
    return question;
  },
};
