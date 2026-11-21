// User-facing wording shared by screens. Copy comes from the wiki; the data layer's own messages
// are for developers and never reach the screen.
import { isDataError, type RewardCap } from '../data';

/** wiki › Transversal: «Sin conexión» and «Algo falló, intenta de nuevo». */
export function errorMessage(error: unknown): string {
  if (isDataError(error) && error.code === 'offline') return 'Sin conexión, intenta de nuevo';
  if (isDataError(error) && error.code === 'unauthenticated') return 'Crea tu cuenta para seguir';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión, intenta de nuevo';
  return 'Algo falló, intenta de nuevo';
}

/** «A 1 vecino le sirvió» · «A 3 les sirvió» */
export function helpedText(count: number): string {
  return count === 1 ? 'A 1 vecino le sirvió' : `A ${count} les sirvió`;
}

/** First name, for «Lucía recibe +1 yapita». */
export function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName;
}

/** Whole minutes until an ISO date, at least 1 (wiki #187). */
function minutesUntil(iso: string | undefined): number {
  const ms = iso ? Date.parse(iso) - Date.now() : NaN;
  return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 60_000)) : 60;
}

/**
 * Why a «Me sirvió» paid nothing (wiki #188-189), or null when it paid. `name` is who would have received it.
 * A letrero past 10 a day has its own notice where it is published.
 */
export function rewardCapMessage(cap: RewardCap | null, name: string): string | null {
  if (cap === 'pair_per_day') return `Ya le diste 3 premios hoy a ${name}: este queda marcado, sin yapitas.`;
  if (cap === 'answers_per_question') return 'Ya diste 3 «Me sirvió» con premio en esta pregunta: este queda marcado, sin yapitas.';
  return null;
}

/** wiki › flujo-final › 2: what each question limit says. Null for an error that is not a limit. */
export function limitMessage(error: unknown): string | null {
  if (!isDataError(error) || error.code !== 'limit') return null;
  switch (error.limit) {
    case 'questions_per_day':
      return 'Llegaste al límite de hoy. Puedes volver a hacerlo mañana';
    case 'open_questions':
      return 'Cierra una de tus preguntas para hacer otra';
    case 'urgent_active':
      return 'Ya tienes una pregunta urgente';
    case 'insufficient_balance':
      return 'Te faltan yapitas para una pregunta urgente';
    case 'comments_per_hour':
      return `Llegaste al límite de comentarios. Puedes volver a comentar en ${minutesUntil(error.until)} min`;
    default:
      return 'No se puede por ahora';
  }
}
