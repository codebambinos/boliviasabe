// Yo › «Mi actividad»: my questions, my answers and my signs (newest first). Off for guests (`enabled`).
import { useQuery } from '@tanstack/react-query';
import { keys } from '../keys';
import { api } from '../source';

type Options = { enabled?: boolean };

export function useMyQuestions(options: Options = {}) {
  return useQuery({ queryKey: keys.myQuestions(), queryFn: () => api.activity.myQuestions(), enabled: options.enabled ?? true });
}

export function useMyAnswers(options: Options = {}) {
  return useQuery({ queryKey: keys.myAnswers(), queryFn: () => api.activity.myAnswers(), enabled: options.enabled ?? true });
}

export function useMySigns(options: Options = {}) {
  return useQuery({ queryKey: keys.mySigns(), queryFn: () => api.activity.mySigns(), enabled: options.enabled ?? true });
}
