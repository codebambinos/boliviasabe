// TanStack Query keys. Every key starts with "data" so a session change can refresh everything.
import type { ListQuery } from './api';
import type { Id } from './types';

type ListFilters = Omit<ListQuery, 'cursor'>;

export const keys = {
  all: ['data'] as const,
  session: () => ['data', 'session'] as const,
  recovery: () => ['data', 'session', 'recovery'] as const,
  signs: () => ['data', 'signs'] as const,
  signList: (filters: ListFilters) => ['data', 'signs', 'list', filters] as const,
  sign: (id: Id) => ['data', 'signs', 'detail', id] as const,
  questions: () => ['data', 'questions'] as const,
  questionList: (filters: ListFilters) => ['data', 'questions', 'list', filters] as const,
  question: (id: Id) => ['data', 'questions', 'detail', id] as const,
  similar: (text: string) => ['data', 'questions', 'similar', text] as const,
  saved: () => ['data', 'saved'] as const,
  wallet: () => ['data', 'wallet'] as const,
  movements: () => ['data', 'wallet', 'movements'] as const,
  activity: () => ['data', 'activity'] as const,
  myQuestions: () => ['data', 'activity', 'questions'] as const,
  myAnswers: () => ['data', 'activity', 'answers'] as const,
  mySigns: () => ['data', 'activity', 'signs'] as const,
};
