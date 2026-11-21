// What the wiki says before «Preguntar» opens its form (flujo-final › 2): 3 open questions with answers, or 10
// today (in Bolivia's day). It reads «Mis preguntas», so it is only a convenience: the data layer's `limit`
// error is the rule, and the server enforces it (T23).
import { BOLIVIA_TIME_ZONE, type Question } from '../data';
import { isUrgentActive } from './QuestionCard';

export const MAX_QUESTIONS_PER_DAY = 10;
export const MAX_OPEN_WITH_ANSWERS = 3;
export const URGENT_COST = 5;

const day = (date: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: BOLIVIA_TIME_ZONE }).format(new Date(date));

export type AskLimit = { kind: 'open'; questions: Question[] } | { kind: 'day' } | null;

export function askLimit(mine: Question[], now = new Date()): AskLimit {
  if (mine.filter((q) => day(q.createdAt) === day(now)).length >= MAX_QUESTIONS_PER_DAY) return { kind: 'day' };
  const open = mine.filter((q) => q.status === 'open' && q.answerCount > 0);
  return open.length >= MAX_OPEN_WITH_ANSWERS ? { kind: 'open', questions: open } : null;
}

/** Why «Urgente» is off, or null when it can be used. */
export function urgentBlocker(mine: Question[], balance: number | null): string | null {
  if (mine.some((q) => isUrgentActive(q))) return 'Ya tienes una pregunta urgente';
  if (balance === null) return 'Tu cuenta se está preparando';
  if (balance < URGENT_COST) return `Te faltan ${URGENT_COST - balance} yapitas`;
  return null;
}
