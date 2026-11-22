// What ShellLayout shares with the pages inside the shell, through the Outlet (SPEC 04).
import type { RefObject } from 'react';
import { useOutletContext } from 'react-router';
import type { City, Id, Sign } from '../data';

export type ShellContext = {
  city: City;
  setCity: (city: City) => void;
  /** Hoy's search input: the top bar shows the lupa while it is off screen. */
  searchRef: RefObject<HTMLInputElement | null>;
  /** Opens a letrero in its sheet. */
  openSign: (sign: Sign) => void;
  onToggleSave: (sign: Sign) => void;
  /** The letrero just published (wiki #167): Hoy plays its entrance once. Cleared after a few seconds. */
  freshSignId: Id | null;
  /** Opens a question's conversation: the page `/p/:id` on a phone, the side panel (`?p=<id>`) on desktop. */
  openQuestion: (id: Id, options?: { share?: boolean; chargeFailed?: boolean }) => void;
  /** The question open in the desktop panel (from `?p=<id>` on /preguntas), or null. */
  selectedQuestion: Id | null;
  /** Questions left from the panel after deleting, reporting or hiding them: the list leaves them out at once. */
  goneQuestions: ReadonlySet<Id>;
  /** Opens «Preguntar», with the text already written when it comes from a search. */
  openAsk: (text?: string) => void;
  /** Opens «Subir letrero» (Yo › Mis letreros, when empty). */
  openUpload: () => void;
  /** Opens the Avisos sheet (SPEC 24): the bell and the Avisos card in Yo. */
  openAvisos: () => void;
  openAbout: () => void;
  openPrivacy: () => void;
  signInWithGoogle: () => void;
  signingIn: boolean;
};

export const useShell = () => useOutletContext<ShellContext>();
