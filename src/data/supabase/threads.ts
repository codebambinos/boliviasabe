// Threads, «Pedir contacto» and the live question of the Supabase adapter (SPEC 12, T22).
// Comments are written through the table (RLS: own rows); contact requests only through `request_contact` and
// `respond_contact`, which keep the e-mail and phone away from anyone but the two people.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Answer, Comment, ContactState, Question } from '../types';
import { supabase } from './client';
import { requireMe } from './me';
import { rpc, toDataError } from './rpc';

async function commentOf(answerId: number, id: number): Promise<Comment> {
  const { data: answer, error } = await supabase.from('answers').select('question_id').eq('id', answerId).single<{ question_id: number }>();
  if (error) throw toDataError(error);
  const { answers } = await rpc<{ question: Question; answers: Answer[] }>('get_question', { p_id: answer.question_id });
  const comment = answers.find((a) => a.id === answerId)?.comments.find((c) => c.id === id);
  if (!comment) throw new DataError('not_found', 'This comment is no longer available');
  return comment;
}

export const supabaseComments: DataApi['comments'] = {
  async create(answerId, text) {
    const me = await requireMe();
    const { data, error } = await supabase
      .from('answer_comments')
      .insert({ answer_id: answerId, author_id: me.id, text: text.trim() })
      .select('id')
      .single<{ id: number }>();
    if (error) throw toDataError(error);
    return commentOf(answerId, data.id);
  },

  async remove(id) {
    const { data, error } = await supabase.from('answer_comments').delete().eq('id', id).select('id');
    if (error) throw toDataError(error);
    if (!data.length) {
      const { count } = await supabase.from('answer_comments').select('id', { count: 'exact', head: true }).eq('id', id);
      if (!count) throw new DataError('not_found', 'This comment is no longer available');
      throw new DataError('forbidden', 'You can only delete your own comment');
    }
  },
};

export const supabaseContact: DataApi['contact'] = {
  request: (answerId, phone) => rpc<ContactState>('request_contact', { p_answer_id: answerId, p_phone: phone?.trim() || null }),

  respond: (requestId, accept, phone) =>
    rpc<ContactState>('respond_contact', { p_request_id: requestId, p_accept: accept, p_phone: phone?.trim() || null }),

  async myPhone() {
    const me = await requireMe();
    const { data, error } = await supabase.from('profiles').select('phone').eq('id', me.id).single<{ phone: string | null }>();
    if (error) throw toDataError(error);
    return data.phone;
  },
};

type Row = { answer_id?: number; question_id?: number };

/**
 * One channel per open question. Answers and contact requests are filtered by question on the server; comments and
 * ratings only name their answer, so they are passed on with `answerId` and the hook keeps the ones it shows.
 * Events only trigger a refetch: their payload is not trusted or merged.
 */
export const supabaseLive: Pick<DataApi['live'], 'question'> = {
  question(questionId, onChange, onStatus) {
    const byQuestion = { schema: 'public', filter: `question_id=eq.${questionId}` } as const;
    const byAnswer = (payload: { new: Row; old: Row }) => onChange(payload.new?.answer_id ?? payload.old?.answer_id ?? null);
    const channel = supabase
      .channel(`question:${questionId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', table: 'answers', ...byQuestion }, () => onChange(null))
      .on('postgres_changes', { event: '*', table: 'contact_requests', ...byQuestion }, () => onChange(null))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answer_comments' }, byAnswer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings' }, byAnswer)
      .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
    return () => {
      onStatus?.(false);
      void supabase.removeChannel(channel);
    };
  },
};
