// Yo › «Mi actividad»: my questions, my answers and my signs (newest first).
import { useQuery } from '@tanstack/react-query';
import { keys } from '../keys';
import { api } from '../source';

export function useMyQuestions() {
  return useQuery({ queryKey: keys.myQuestions(), queryFn: () => api.activity.myQuestions() });
}

export function useMyAnswers() {
  return useQuery({ queryKey: keys.myAnswers(), queryFn: () => api.activity.myAnswers() });
}

export function useMySigns() {
  return useQuery({ queryKey: keys.mySigns(), queryFn: () => api.activity.mySigns() });
}
