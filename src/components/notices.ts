// Avisos (SPEC 24, wiki #203, #214, #216): the line each notice shows. The same words as its push
// (lib/push/message.ts), so a push and its notice say the same; grouped «Me sirvió» of a letrero count the neighbors.
import type { Notice } from '../data';

/** What a notice points at inside its question, found by its text (the notice carries the full text, SPEC 22). */
export type NoticeFocus = { kind: 'answer' | 'comment'; text: string };

/** Answers and «Me sirvió» point at the answer, comments at the comment; the rest open the question's top. */
export function noticeFocus(notice: Notice): NoticeFocus | undefined {
  if (!notice.text) return undefined;
  if (notice.kind === 'answer' || notice.kind === 'helpful') return { kind: 'answer', text: notice.text };
  if (notice.kind === 'comment') return { kind: 'comment', text: notice.text };
  return undefined;
}

/** «Ana respondió tu pregunta» · «A 4 vecinos les sirvió tu letrero» · «¿Alguna respuesta te sirvió?» */
export function noticeLine(notice: Notice): string {
  const who = notice.actor?.trim() || 'Un vecino';
  // Mid-sentence («A un vecino le sirvió…») the fallback is lowercase
  const toWhom = notice.actor?.trim() || 'un vecino';
  switch (notice.kind) {
    case 'answer':
      return `${who} respondió tu pregunta`;
    case 'comment':
      return `${who} comentó en un hilo`;
    case 'helpful':
      return `A ${toWhom} le sirvió tu respuesta`;
    case 'sign_helpful':
      return notice.count > 1 ? `A ${notice.count} vecinos les sirvió tu letrero` : `A ${toWhom} le sirvió tu letrero`;
    case 'contact_request':
      return `${who} te pide tu contacto`;
    case 'contact_accepted':
      return `${who} aceptó compartir su contacto`;
    case 'urgent':
      return `Pregunta urgente en ${notice.zone?.trim() || 'tu zona'}`;
    case 'reminder':
      return '¿Alguna respuesta te sirvió?';
  }
}
