// ¿Alguien sabe? hooks: questions and answers.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListQuery, NewQuestion } from '../api';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Answer, Id } from '../types';

/** Pages of 30 questions in the wiki order (urgent → your zone → city → solved/closed). */
export function useQuestions(filters: Omit<ListQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: keys.questionList(filters),
    queryFn: ({ pageParam }) => api.questions.list({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Every 15 s while the question is on screen and not live, so a new answer shows up by itself (wiki #181, #185). */
const QUESTION_REFRESH_MS = 15_000;

/**
 * A question with its answers (helpful first, then oldest first). `live` is true while its Realtime channel is
 * connected (`useLiveQuestion`); otherwise the detail falls back to the 15 s refresh. Threads keep going on
 * Solucionada and Cerrada questions, so the fallback runs for every status.
 */
export function useQuestion(id: Id, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: keys.question(id),
    queryFn: () => api.questions.get(id),
    // The interval pauses by itself while the tab is in the background
    refetchInterval: live ? false : QUESTION_REFRESH_MS,
  });
}

/** «Preguntas parecidas»: only queries once the text has 3 words. */
export function useSimilarQuestions(text: string) {
  const enough = text.trim().split(/\s+/).filter(Boolean).length >= 3;
  return useQuery({
    queryKey: keys.similar(text.trim()),
    queryFn: () => api.questions.similar(text),
    enabled: enough,
  });
}

/** Resolves to { question, urgentCharged }. urgentCharged=false: published as normal, not charged. */
export function useCreateQuestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewQuestion) => api.questions.create(input),
    onSuccess: () => invalidate(client, keys.questions(), keys.wallet(), keys.activity()),
  });
}

export function useRemoveQuestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api.questions.remove(id),
    onSuccess: () => invalidate(client, keys.questions(), keys.saved(), keys.activity()),
  });
}

/** «Ninguna me sirvió»: closes the question (+1 once). */
export function useCloseQuestion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => api.questions.closeWithoutSolution(id),
    onSuccess: () => invalidate(client, keys.questions(), keys.wallet(), keys.activity()),
  });
}

/** After any answer change, refresh that question, the lists, the wallet and «Mi actividad». */
function useAnswerMutation<TInput>(run: (input: TInput) => Promise<Answer | void>, questionIdOf: (input: TInput) => Id | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (answer, input) => {
      const questionId = answer ? answer.questionId : questionIdOf(input);
      invalidate(client, ...(questionId ? [keys.question(questionId)] : []), keys.questions(), keys.wallet(), keys.activity());
    },
  });
}

export const useCreateAnswer = () =>
  useAnswerMutation(({ questionId, text }: { questionId: Id; text: string }) => api.answers.create(questionId, text), (i) => i.questionId);

/** Only the asker. Pays +5 to the helper; the first one marks the question «✓ Solucionada». */
export const useMarkHelpful = () => useAnswerMutation((id: Id) => api.answers.markHelpful(id), () => null);

export const useMarkNotHelpful = () => useAnswerMutation((id: Id) => api.answers.markNotHelpful(id), () => null);

export const useRemoveAnswer = () =>
  useAnswerMutation(({ id }: { id: Id; questionId: Id }) => api.answers.remove(id), (i) => i.questionId);
