// User-facing wording shared by screens. Copy comes from the wiki; the data layer's own messages
// are for developers and never reach the screen.
import { isDataError } from '../data';

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
