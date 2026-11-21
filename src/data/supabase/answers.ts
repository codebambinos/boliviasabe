// `answers` of the Supabase adapter (SPEC 11, T39). The database refuses an answer to one's own question, a
// second answer and an answer to a closed question; `rate_answer` marks «Me sirvió» and solves the question.
import type { DataApi } from '../api';
import { DataError } from '../errors';
import type { Answer, Question, QuestionStatus } from '../types';
import { supabase } from './client';
import { requireMe } from './me';
import { requestReward } from './rewards';
import { rpc, toDataError } from './rpc';

async function answerOf(questionId: number, id: number): Promise<Answer> {
  const { answers } = await rpc<{ question: Question; answers: Answer[] }>('get_question', { p_id: questionId });
  const answer = answers.find((a) => a.id === id);
  if (!answer) throw new DataError('not_found', 'This answer is no longer available');
  return answer;
}

type Rated = { answer: Answer; questionStatus: QuestionStatus };

export const supabaseAnswers: DataApi['answers'] = {
  async create(questionId, text) {
    const me = await requireMe();
    const { data, error } = await supabase
      .from('answers')
      .insert({ question_id: questionId, author_id: me.id, text: text.trim() })
      .select('id')
      .single<{ id: number }>();
    if (error) throw toDataError(error);
    return answerOf(questionId, data.id);
  },

  /** +5 to the helper and, when it solves (or the question was already closed), +1 to the asker for closing. */
  async markHelpful(id) {
    const { answer, questionStatus } = await rpc<Rated>('rate_answer', { p_answer_id: id, p_helpful: true });
    requestReward('ayuda', id);
    if (questionStatus !== 'open') requestReward('cierre', answer.questionId);
    return answer;
  },

  async markNotHelpful(id) {
    const { answer } = await rpc<Rated>('rate_answer', { p_answer_id: id, p_helpful: false });
    return answer;
  },

  /** Only mine and only before anyone rated it (RLS). */
  async remove(id) {
    const { data, error } = await supabase.from('answers').delete().eq('id', id).select('id');
    if (error) throw toDataError(error);
    if (!data.length) {
      const { count } = await supabase.from('answers').select('id', { count: 'exact', head: true }).eq('id', id);
      if (!count) throw new DataError('not_found', 'This answer is no longer available');
      throw new DataError('forbidden', 'An answer that was rated cannot be deleted');
    }
  },
};
