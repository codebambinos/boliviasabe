// Threads, «Pedir contacto» and the live question detail (SPEC 12, T22).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { keys } from '../keys';
import { invalidate } from '../query';
import { api } from '../source';
import type { Answer, Id, Question } from '../types';

/** Publishes a comment (up to 500 characters) and refreshes its question. */
export function useCreateComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, text }: { answerId: Id; questionId: Id; text: string }) => api.comments.create(answerId, text),
    onSuccess: (_comment, { questionId }) => invalidate(client, keys.question(questionId)),
  });
}

export function useRemoveComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: Id; questionId: Id }) => api.comments.remove(id),
    onSuccess: (_void, { questionId }) => invalidate(client, keys.question(questionId)),
  });
}

/** «Pedir contacto»: only the asker, on someone else's answer. The phone (optional) is saved in the profile. */
export function useRequestContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, phone }: { answerId: Id; questionId: Id; phone?: string }) => api.contact.request(answerId, phone),
    // The notice of that request changes too (Aceptar / Ahora no leave Avisos)
    onSuccess: (_state, { questionId }) => invalidate(client, keys.question(questionId), keys.myPhone(), keys.notices()),
  });
}

/** «Aceptar» (with an optional phone) or «Ahora no», by the person asked. */
export function useRespondContact() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, accept, phone }: { requestId: Id; questionId: Id; accept: boolean; phone?: string }) =>
      api.contact.respond(requestId, accept, phone),
    // The notice of that request changes too (Aceptar / Ahora no leave Avisos)
    onSuccess: (_state, { questionId }) => invalidate(client, keys.question(questionId), keys.myPhone(), keys.notices()),
  });
}

/** The phone saved in the caller's profile, to prefill «Tu celular (opcional)». */
export function useMyPhone(enabled = true) {
  return useQuery({ queryKey: keys.myPhone(), queryFn: () => api.contact.myPhone(), enabled });
}

/**
 * Listens to the question while it is on screen and refreshes it at once when a comment, answer, rating or contact
 * request changes (wiki #185). Returns whether the channel is connected; while it is not, `useQuestion` keeps its
 * 15 s refresh.
 */
export function useLiveQuestion(questionId: Id): boolean {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const refresh = (answerId: Id | null) => {
      if (answerId !== null) {
        // Comments and ratings name only their answer: keep the ones of this question
        const cached = client.getQueryData<{ question: Question; answers: Answer[] }>(keys.question(questionId));
        if (cached && !cached.answers.some((a) => a.id === answerId)) return;
      }
      invalidate(client, keys.question(questionId));
    };
    const stop = api.live.question(questionId, refresh, setConnected);
    return () => {
      stop();
      setConnected(false);
    };
  }, [client, questionId]);

  return connected;
}
