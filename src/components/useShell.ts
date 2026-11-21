// What ShellLayout shares with the pages inside the shell, through the Outlet (SPEC 04).
import type { RefObject } from 'react';
import { useOutletContext } from 'react-router';
import type { City, Sign } from '../data';

export type ShellContext = {
  city: City;
  setCity: (city: City) => void;
  /** Hoy's search input: the top bar shows the lupa while it is off screen. */
  searchRef: RefObject<HTMLInputElement | null>;
  /** Opens a letrero in its sheet. */
  openSign: (sign: Sign) => void;
  onToggleSave: (sign: Sign) => void;
  openAbout: () => void;
  openPrivacy: () => void;
  signInWithGoogle: () => void;
  signingIn: boolean;
};

export const useShell = () => useOutletContext<ShellContext>();
