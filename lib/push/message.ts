/**
 * The text of a push (SPEC 15, wiki #203): who did it and a piece of what they wrote, at most 80 characters.
 * UI copy, so it is in Spanish. Pure: /api/push gives it the facts from `push_details`.
 */

export type NotificationKind =
  | 'answer'
  | 'comment'
  | 'helpful'
  | 'sign_helpful'
  | 'contact_request'
  | 'contact_accepted'
  | 'urgent'
  | 'reminder';

/** The 4 switches of Ajustes › Notificaciones; a missing key means on (#204). */
export type PrefKey = 'answers' | 'helpful' | 'contacts' | 'urgent';

export const PREF_OF: Record<NotificationKind, PrefKey> = {
  answer: 'answers',
  comment: 'answers',
  helpful: 'helpful',
  sign_helpful: 'helpful',
  contact_request: 'contacts',
  contact_accepted: 'contacts',
  urgent: 'urgent',
  // The 24 h «¿Alguna respuesta te sirvió?» is about your answers (SPEC 18, wiki #208)
  reminder: 'answers',
};

export type PushFacts = {
  kind: NotificationKind;
  refId: number;
  actor: string | null;
  text: string | null;
  zone: string | null;
  url: string;
};

/** What the service worker shows (src/sw.ts). `tag` replaces an earlier push about the same thing. */
export type PushMessage = { title: string; body: string; url: string; tag: string };

const MAX = 80;

export function snippet(text: string | null): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX ? `${clean.slice(0, MAX - 1).trimEnd()}…` : clean;
}

export function buildMessage(facts: PushFacts): PushMessage {
  const who = facts.actor?.trim() || 'Un vecino';
  // Mid-sentence («A un vecino le sirvió…») the fallback is lowercase
  const toWhom = facts.actor?.trim() || 'un vecino';
  const quote = snippet(facts.text);
  const tag = `${facts.kind}-${facts.refId}`;
  const message = (title: string, body: string): PushMessage => ({ title, body, url: facts.url, tag });
  switch (facts.kind) {
    case 'answer':
      return message(`${who} respondió tu pregunta`, quote);
    case 'comment':
      return message(`${who} comentó en un hilo`, quote);
    case 'helpful':
      return message(`A ${toWhom} le sirvió tu respuesta`, quote);
    case 'sign_helpful':
      return message(`A ${toWhom} le sirvió tu letrero`, quote);
    case 'contact_request':
      return message(`${who} te pide tu contacto`, quote);
    case 'contact_accepted':
      return message(`${who} aceptó compartir su contacto`, 'Ábrelo para ver cómo escribirle');
    case 'urgent':
      return message(`Pregunta urgente en ${facts.zone?.trim() || 'tu zona'}`, quote);
    case 'reminder':
      return message('¿Alguna respuesta te sirvió?', quote);
  }
}

/** True when the person turned this kind off in Ajustes. */
export function turnedOff(prefs: unknown, kind: NotificationKind): boolean {
  if (typeof prefs !== 'object' || prefs === null) return false;
  return (prefs as Record<string, unknown>)[PREF_OF[kind]] === false;
}
