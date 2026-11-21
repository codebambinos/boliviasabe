// «Instalar la app» (SPEC 16, wiki #199). Chrome and Android fire `beforeinstallprompt` once, early, so it is caught
// as soon as this module loads (main.tsx imports it) and kept for the Ajustes row.
// iPhone has no prompt: the row opens the steps to add the app to the home screen (InstallSteps).
import { useSyncExternalStore } from 'react';

export type InstallPlatform = 'prompt' | 'ios' | 'installed' | 'unavailable';

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** iPhone, iPod and iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // no mini-infobar: the row in Ajustes offers it
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', notify);
}

function getPlatform(): InstallPlatform {
  if (justInstalled || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'unavailable';
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Opens the browser's install prompt. True when the person accepted. */
async function install(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferred = null; // a prompt can be shown only once
  if (outcome === 'accepted') justInstalled = true;
  notify();
  return outcome === 'accepted';
}

export function useInstall(): { platform: InstallPlatform; install: () => Promise<boolean> } {
  const platform = useSyncExternalStore(subscribe, getPlatform, () => 'unavailable' as const);
  return { platform, install };
}
